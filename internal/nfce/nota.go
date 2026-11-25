package nfce

import (
	"errors"
	"time"
)

type Item struct {
	Codigo     string  `json:"codigo"`
	Descricao  string  `json:"descricao"`
	Unidade    string  `json:"unidade"`
	Qtd        float64 `json:"qtd"`
	ValorUnit  int64   `json:"valorUnit"`
	ValorTotal int64   `json:"valorTotal"`
}

type Loja struct {
	Nome string `json:"nome"`
	CNPJ string `json:"cnpj"`
}

type Nota struct {
	Chave     string    `json:"chave"`
	Loja      Loja      `json:"loja"`
	EmitidaEm time.Time `json:"emitidaEm"`
	Total     int64     `json:"total"`
	Itens     []Item    `json:"itens"`
}

var ErrSemItens = errors.New("nenhum item encontrado na página")

// brt is Brasília time; Brazil has had no daylight saving since 2019.
var brt = time.FixedZone("BRT", -3*60*60)
