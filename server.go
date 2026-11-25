package main

import (
	"embed"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"net/url"

	"notinha/internal/nfce"
)

//go:embed web
var webFS embed.FS

const maxPage = 2 << 20 // a NFC-e page is a few dozen KB

func newServer(fetch *http.Client, allowed map[string]bool) http.Handler {
	static, _ := fs.Sub(webFS, "web")
	c := *fetch
	c.CheckRedirect = func(r *http.Request, via []*http.Request) error {
		if len(via) >= 5 || r.URL.Scheme != "https" || !allowed[r.URL.Hostname()] {
			return errors.New("redirect fora da SEFAZ")
		}
		return nil
	}
	fetch = &c
	mux := http.NewServeMux()
	mux.Handle("GET /", http.FileServerFS(static))
	mux.HandleFunc("POST /api/nota", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
			fail(w, 400, "Pedido inválido")
			return
		}
		u, err := url.Parse(req.URL)
		if err != nil || u.Scheme != "https" || !allowed[u.Hostname()] {
			fail(w, 400, "Por enquanto só notas de SC")
			return
		}
		chave, err := nfce.ChaveFromURL(req.URL)
		if err != nil {
			fail(w, 400, "Esse QR Code não é de uma nota fiscal")
			return
		}
		res, err := fetch.Get(u.String())
		if err != nil {
			fail(w, 502, "A SEFAZ não respondeu, tente de novo")
			return
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			fail(w, 502, "A SEFAZ não respondeu, tente de novo")
			return
		}
		nota, err := nfce.ParseSC(io.LimitReader(res.Body, maxPage), chave)
		if err != nil {
			if !errors.Is(err, nfce.ErrSemItens) && isTimeout(err) {
				fail(w, 502, "A SEFAZ não respondeu, tente de novo")
				return
			}
			fail(w, 422, "Não consegui ler os itens desta nota")
			return
		}
		writeJSON(w, 200, nota)
	})
	return mux
}

func isTimeout(err error) bool {
	var t interface{ Timeout() bool }
	return errors.As(err, &t) && t.Timeout()
}

func fail(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"erro": msg})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
