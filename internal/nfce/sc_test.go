package nfce

import (
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

const chaveTeste = "42261112345678000190650010000012341000012345"

func TestParseSC(t *testing.T) {
	f, err := os.Open("testdata/sc_exemplo.html")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	n, err := ParseSC(f, chaveTeste)
	if err != nil {
		t.Fatal(err)
	}
	if n.Chave != chaveTeste || n.Loja.Nome != "SUPERMERCADO EXEMPLO LTDA" || n.Loja.CNPJ != "12.345.678/0001-90" {
		t.Errorf("cabeçalho: %+v", n)
	}
	if n.Total != 5874 {
		t.Errorf("total = %d", n.Total)
	}
	want := time.Date(2026, 11, 25, 10, 42, 17, 0, brt)
	if !n.EmitidaEm.Equal(want) {
		t.Errorf("emitidaEm = %v", n.EmitidaEm)
	}
	if len(n.Itens) != 3 {
		t.Fatalf("itens = %d", len(n.Itens))
	}
	if got := n.Itens[0]; got != (Item{Codigo: "7896089012453", Descricao: "CAFE PILAO 500G", Qtd: 1, Unidade: "UN", ValorUnit: 1899, ValorTotal: 1899}) {
		t.Errorf("item 0 = %+v", got)
	}
	if got := n.Itens[1]; got.Qtd != 1.234 || got.Unidade != "KG" || got.ValorTotal != 801 {
		t.Errorf("item 1 = %+v", got)
	}
}

func TestParseNoItemsIsError(t *testing.T) {
	_, err := ParseSC(strings.NewReader("<html><body></body></html>"), chaveTeste)
	if !errors.Is(err, ErrSemItens) {
		t.Errorf("err = %v", err)
	}
}
