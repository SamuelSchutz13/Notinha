package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDevFixtureTransport(t *testing.T) {
	srv := httptest.NewServer(newServer(&http.Client{Transport: fixtureTransport("internal/nfce/testdata/sc_exemplo.html")}, allowedHosts))
	defer srv.Close()
	code, out := post(t, srv, "https://sat.sef.sc.gov.br/nfce/consulta?p="+chave+"|2|1|1|X")
	if code != 200 || len(out["itens"].([]any)) != 3 {
		t.Errorf("code=%d out=%v", code, out)
	}
}
