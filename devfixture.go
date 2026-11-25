package main

import (
	"bytes"
	"io"
	"net/http"
	"os"
)

// fixtureTransport answers every request with a saved NFC-e page, so the app can be
// tried locally (NOTINHA_DEV_FIXTURE=1) without hitting the real SEFAZ.
type fixtureTransport string

func (f fixtureTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	b, err := os.ReadFile(string(f))
	if err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(b)), Header: http.Header{}, Request: r}, nil
}
