package nfce

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var (
	reCents = regexp.MustCompile(`^(\d+)(?:,(\d{1,2}))?$`)
	reChave = regexp.MustCompile(`^\d{44}$`)
)

// clean removes currency, spaces and thousand separators from a pt-BR number.
func clean(s string) string {
	s = strings.ReplaceAll(s, "R$", "")
	s = strings.Join(strings.Fields(s), "")
	return strings.ReplaceAll(s, ".", "")
}

// ParseCents reads a pt-BR money value ("1.234,56") as integer cents.
func ParseCents(s string) (int64, error) {
	m := reCents.FindStringSubmatch(clean(s))
	if m == nil {
		return 0, fmt.Errorf("valor inválido: %q", s)
	}
	frac := (m[2] + "00")[:2]
	n, err := strconv.ParseInt(m[1]+frac, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("valor inválido: %q", s)
	}
	return n, nil
}

// ParseQty reads a pt-BR quantity ("1,234").
func ParseQty(s string) (float64, error) {
	c := strings.ReplaceAll(clean(s), ",", ".")
	if c == "" {
		return 0, errors.New("quantidade vazia")
	}
	return strconv.ParseFloat(c, 64)
}

// ChaveFromURL extracts the 44-digit access key from a NFC-e QR code URL.
func ChaveFromURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	chave, _, _ := strings.Cut(u.Query().Get("p"), "|")
	if !reChave.MatchString(chave) {
		return "", errors.New("link sem chave de acesso válida")
	}
	return chave, nil
}
