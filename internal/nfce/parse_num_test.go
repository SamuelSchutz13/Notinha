package nfce

import "testing"

func TestParseCents(t *testing.T) {
	ok := map[string]int64{"1.234,56": 123456, "10,99": 1099, "R$ 3,5": 350, "7": 700, "0,05": 5}
	for in, want := range ok {
		got, err := ParseCents(in)
		if err != nil || got != want {
			t.Errorf("ParseCents(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for _, in := range []string{"", "abc", "1,234"} {
		if _, err := ParseCents(in); err == nil {
			t.Errorf("ParseCents(%q) want error", in)
		}
	}
}

func TestParseQty(t *testing.T) {
	ok := map[string]float64{"1,234": 1.234, "2": 2, "0,5": 0.5}
	for in, want := range ok {
		got, err := ParseQty(in)
		if err != nil || got != want {
			t.Errorf("ParseQty(%q) = %v, %v; want %v", in, got, err, want)
		}
	}
	if _, err := ParseQty(""); err == nil {
		t.Error("ParseQty(\"\") want error")
	}
}

func TestChaveFromURL(t *testing.T) {
	got, err := ChaveFromURL("https://sat.sef.sc.gov.br/nfce/consulta?p=42261112345678000190650010000012341000012345|2|1|1|ABC")
	if err != nil || got != "42261112345678000190650010000012341000012345" {
		t.Errorf("got %q, %v", got, err)
	}
	for _, in := range []string{"https://sat.sef.sc.gov.br/nfce/consulta?p=123|2", "https://x/?q=1", "::"} {
		if _, err := ChaveFromURL(in); err == nil {
			t.Errorf("ChaveFromURL(%q) want error", in)
		}
	}
}
