package nfce

import (
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/html"
)

var (
	reCNPJ    = regexp.MustCompile(`\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}`)
	reEmissao = regexp.MustCompile(`Emissão:\s*(\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})`)
	reCodigo  = regexp.MustCompile(`Código:\s*([^)\s]+)`)
)

// ParseSC reads the SEF/SC NFC-e consultation page (standard portal template).
func ParseSC(r io.Reader, chave string) (Nota, error) {
	doc, err := html.Parse(r)
	if err != nil {
		return Nota{}, err
	}
	n := Nota{Chave: chave}
	n.Loja.Nome = text(first(doc, "txtTopo"))
	for _, d := range all(doc, "text") {
		if c := reCNPJ.FindString(text(d)); c != "" {
			n.Loja.CNPJ = c
			break
		}
	}
	if t := first(doc, "txtMax"); t != nil {
		if n.Total, err = ParseCents(text(t)); err != nil {
			return Nota{}, err
		}
	}
	if m := reEmissao.FindStringSubmatch(text(doc)); m != nil {
		n.EmitidaEm, _ = time.ParseInLocation("02/01/2006 15:04:05", m[1], brt)
	}

	table := byID(doc, "tabResult")
	if table == nil {
		return Nota{}, ErrSemItens
	}
	for _, row := range elems(table, "tr") {
		desc := first(row, "txtTit")
		if desc == nil {
			continue
		}
		it := Item{Descricao: text(desc), Unidade: after(text(first(row, "RUN")), "UN:")}
		if m := reCodigo.FindStringSubmatch(text(first(row, "RCod"))); m != nil {
			it.Codigo = m[1]
		}
		var errs [3]error
		it.Qtd, errs[0] = ParseQty(after(text(first(row, "Rqtd")), "Qtde.:"))
		it.ValorUnit, errs[1] = ParseCents(after(text(first(row, "RvlUnit")), "Vl. Unit.:"))
		it.ValorTotal, errs[2] = ParseCents(text(first(row, "valor")))
		for _, e := range errs {
			if e != nil {
				return Nota{}, fmt.Errorf("item %q: %w", it.Descricao, e)
			}
		}
		n.Itens = append(n.Itens, it)
	}
	if len(n.Itens) == 0 {
		return Nota{}, ErrSemItens
	}
	return n, nil
}

func after(s, label string) string {
	_, v, found := strings.Cut(s, label)
	if !found {
		v = s
	}
	return strings.TrimSpace(v)
}

// text returns the node's text with whitespace (including &nbsp;) collapsed.
func text(n *html.Node) string {
	if n == nil {
		return ""
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
			b.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.Join(strings.Fields(strings.ReplaceAll(b.String(), "\u00a0", " ")), " ")
}

func find(root *html.Node, match func(*html.Node) bool, one bool) []*html.Node {
	var out []*html.Node
	var walk func(*html.Node) bool
	walk = func(n *html.Node) bool {
		if n.Type == html.ElementNode && match(n) {
			out = append(out, n)
			if one {
				return true
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if walk(c) {
				return true
			}
		}
		return false
	}
	walk(root)
	return out
}

func hasClass(class string) func(*html.Node) bool {
	return func(n *html.Node) bool {
		for _, a := range n.Attr {
			if a.Key == "class" {
				for _, c := range strings.Fields(a.Val) {
					if c == class {
						return true
					}
				}
			}
		}
		return false
	}
}

func all(root *html.Node, class string) []*html.Node { return find(root, hasClass(class), false) }

func first(root *html.Node, class string) *html.Node {
	if r := find(root, hasClass(class), true); len(r) > 0 {
		return r[0]
	}
	return nil
}

func byID(root *html.Node, id string) *html.Node {
	r := find(root, func(n *html.Node) bool {
		for _, a := range n.Attr {
			if a.Key == "id" && a.Val == id {
				return true
			}
		}
		return false
	}, true)
	if len(r) > 0 {
		return r[0]
	}
	return nil
}

func elems(root *html.Node, tag string) []*html.Node {
	return find(root, func(n *html.Node) bool { return n.Data == tag }, false)
}
