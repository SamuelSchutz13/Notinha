package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const chave = "42261112345678000190650010000012341000012345"

func fixture(t *testing.T) []byte {
	b, err := os.ReadFile("internal/nfce/testdata/sc_exemplo.html")
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// setup returns our server and the note URL pointing at a fake SEFAZ.
func setup(t *testing.T, upstream http.HandlerFunc, timeout time.Duration) (*httptest.Server, string, *atomic.Int32) {
	var hits atomic.Int32
	up := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		upstream(w, r)
	}))
	t.Cleanup(up.Close)
	c := up.Client()
	c.Timeout = timeout
	u, _ := url.Parse(up.URL)
	srv := httptest.NewServer(newServer(c, map[string]bool{u.Hostname(): true}))
	t.Cleanup(srv.Close)
	return srv, up.URL + "/nfce/consulta?p=" + chave + "|2|1|1|X", &hits
}

func post(t *testing.T, srv *httptest.Server, noteURL string) (int, map[string]any) {
	body, _ := json.Marshal(map[string]string{"url": noteURL})
	res, err := http.Post(srv.URL+"/api/nota", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func TestNotaOK(t *testing.T) {
	page := fixture(t)
	srv, u, _ := setup(t, func(w http.ResponseWriter, r *http.Request) { w.Write(page) }, time.Second)
	code, out := post(t, srv, u)
	if code != 200 || out["chave"] != chave || len(out["itens"].([]any)) != 3 {
		t.Errorf("code=%d out=%v", code, out)
	}
}

func TestRejectsForeignHost(t *testing.T) {
	srv, _, hits := setup(t, func(w http.ResponseWriter, r *http.Request) {}, time.Second)
	code, out := post(t, srv, "https://evil.example/nfce/consulta?p="+chave+"|2")
	if code != 400 || out["erro"] != "Por enquanto só notas de SC" || hits.Load() != 0 {
		t.Errorf("code=%d out=%v hits=%d", code, out, hits.Load())
	}
}

func TestRejectsHTTP(t *testing.T) {
	srv, u, hits := setup(t, func(w http.ResponseWriter, r *http.Request) {}, time.Second)
	code, _ := post(t, srv, strings.Replace(u, "https://", "http://", 1))
	if code != 400 || hits.Load() != 0 {
		t.Errorf("code=%d hits=%d", code, hits.Load())
	}
}

func TestUpstreamTimeout(t *testing.T) {
	srv, u, _ := setup(t, func(w http.ResponseWriter, r *http.Request) { time.Sleep(200 * time.Millisecond) }, 50*time.Millisecond)
	code, out := post(t, srv, u)
	if code != 502 || out["erro"] != "A SEFAZ não respondeu, tente de novo" {
		t.Errorf("code=%d out=%v", code, out)
	}
}

func TestEmptyPage(t *testing.T) {
	srv, u, _ := setup(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "<html></html>") }, time.Second)
	if code, out := post(t, srv, u); code != 422 || out["erro"] != "Não consegui ler os itens desta nota" {
		t.Errorf("code=%d out=%v", code, out)
	}
}

func TestBadBody(t *testing.T) {
	srv, _, _ := setup(t, func(w http.ResponseWriter, r *http.Request) {}, time.Second)
	res, _ := http.Post(srv.URL+"/api/nota", "application/json", strings.NewReader(strings.Repeat("x", 5000)))
	if res.StatusCode != 400 {
		t.Errorf("code=%d", res.StatusCode)
	}
}

func TestServesIndex(t *testing.T) {
	srv, _, _ := setup(t, func(w http.ResponseWriter, r *http.Request) {}, time.Second)
	res, _ := http.Get(srv.URL + "/")
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.Contains(string(b), "Notinha") {
		t.Errorf("code=%d", res.StatusCode)
	}
}

func TestRedirectOffAllowlist(t *testing.T) {
	evil := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("followed redirect off allowlist") }))
	defer evil.Close()
	srv, u, _ := setup(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, evil.URL, 302) }, time.Second)
	if code, _ := post(t, srv, u); code != 502 {
		t.Errorf("code=%d", code)
	}
}
