package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

// Hosts of the SEF/SC NFC-e consultation page (production and homologation).
var allowedHosts = map[string]bool{"sat.sef.sc.gov.br": true, "hom.sat.sef.sc.gov.br": true}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := &http.Client{Timeout: 10 * time.Second}
	log.Printf("Notinha em http://localhost:%s", port)
	// No request logging: note URLs and contents must never be recorded.
	log.Fatal(http.ListenAndServe(":"+port, newServer(client, allowedHosts)))
}
