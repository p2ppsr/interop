// SPDX-License-Identifier: Apache-2.0
// A loopback lifecycle adapter around the pinned upstream handlers and stores.
package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bsv-blockchain/go-bsv-middleware/pkg/middleware"
	"github.com/bsv-blockchain/go-message-box-server/pkg/handlers"
	mbstorage "github.com/bsv-blockchain/go-message-box-server/pkg/storage"
	"github.com/bsv-blockchain/go-message-box-server/pkg/storage/sqlstore"
	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/transaction"
	sdk "github.com/bsv-blockchain/go-sdk/wallet"
	sqlite3 "github.com/mattn/go-sqlite3"
)

func main() {
	state := flag.String("state", "messagebox.sqlite", "isolated SQLite state")
	keyHex := flag.String("key", "", "ephemeral laboratory identity")
	port := flag.String("port", "0", "loopback port")
	adapted := flag.Bool("compatibility", false, "enable explicitly identified SQLite payment interoperability adapter")
	flag.Parse()
	key, err := ec.PrivateKeyFromHex(*keyHex)
	must(err)
	wallet, err := sdk.NewCompletedProtoWallet(key)
	must(err)
	driver := "sqlite3"
	if *adapted {
		driver = "tpnil-messagebox-sqlite"
		sql.Register(driver, &sqlite3.SQLiteDriver{ConnectHook: func(connection *sqlite3.SQLiteConn) error {
			return connection.RegisterFunc("tpnil_payment_id", paymentID, true)
		}})
	}
	store, err := sqlstore.New(driver, *state)
	must(err)
	defer store.Close()
	must(store.EnsureSchema(context.Background()))
	if *adapted {
		db, openErr := sql.Open(driver, *state)
		must(openErr)
		// SQLite evaluates the deterministic txid function inside the same atomic
		// insertion as the upstream message. No parallel replay-claim database,
		// pre-claim crash window, or polling server with recipient secrets is added.
		_, err = db.Exec(`CREATE TABLE IF NOT EXISTS tpnil_payment_claims (
          transaction_id TEXT NOT NULL, recipient TEXT NOT NULL, message_id TEXT NOT NULL,
          PRIMARY KEY(transaction_id, recipient)
        );
        CREATE TRIGGER IF NOT EXISTS tpnil_claim_message_payment BEFORE INSERT ON messages
        WHEN tpnil_payment_id(NEW.body) IS NOT NULL
        BEGIN
          INSERT INTO tpnil_payment_claims(transaction_id, recipient, message_id)
          VALUES(tpnil_payment_id(NEW.body), NEW.recipient, NEW.messageId);
        END;`)
		must(err)
		must(db.Close())
	}
	var messages mbstorage.Store = store
	if *adapted {
		messages = &compatibleStore{Store: store}
	}
	service := handlers.NewServer(messages, wallet)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /sendMessage", service.SendMessage)
	if *adapted {
		mux.HandleFunc("POST /listMessages", normalizePaymentBytes(service.ListMessages))
	} else {
		mux.HandleFunc("POST /listMessages", service.ListMessages)
	}
	mux.HandleFunc("POST /acknowledgeMessage", service.AcknowledgeMessage)
	mux.HandleFunc("POST /registerDevice", service.RegisterDevice)
	mux.HandleFunc("POST /unregisterDevice", service.UnregisterDevice)
	mux.HandleFunc("GET /devices", service.ListDevices)
	mux.HandleFunc("POST /permissions/set", service.SetPermission)
	mux.HandleFunc("GET /permissions/get", service.GetPermission)
	mux.HandleFunc("GET /permissions/list", service.ListPermissions)
	mux.HandleFunc("GET /permissions/quote", service.GetQuote)
	auth := middleware.NewAuth(wallet)
	payment := middleware.NewPayment(wallet, middleware.WithRequestPriceCalculator(func(*http.Request) (int, error) { return 0, nil }))
	server := &http.Server{Handler: auth.HTTPHandler(payment.HTTPHandler(mux)), ReadHeaderTimeout: 10 * time.Second}
	listener, err := net.Listen("tcp", "127.0.0.1:"+*port)
	must(err)
	json.NewEncoder(os.Stdout).Encode(map[string]any{"schema": "tpnil-messagebox-host@1", "origin": "http://" + listener.Addr().String(), "implementation": "go", "identityKey": key.PubKey().ToDERHex(), "websockets": false, "compatibilityAdapter": *adapted})
	go func() {
		if err := server.Serve(listener); err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	must(server.Shutdown(ctx))
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}

// A NULL key permits free messages; a paid body is indexed by its actual txid,
// so different BEEF serializations cannot pay the same recipient twice.
func paymentID(body string) (any, error) {
	var envelope struct {
		Payment *struct {
			Tx []byte `json:"tx"`
		} `json:"payment"`
	}
	if err := json.Unmarshal([]byte(body), &envelope); err != nil {
		return nil, err
	}
	if envelope.Payment == nil {
		return nil, nil
	}
	_, tx, _, err := transaction.ParseBeef(envelope.Payment.Tx)
	if err != nil {
		return nil, err
	}
	if tx == nil {
		return nil, fmt.Errorf("payment has no subject transaction")
	}
	return tx.TxID().String(), nil
}

// BRC-100 uses number[] at its JSON interface. Conversion happens before the
// upstream auth middleware signs the response; client verification is intact.
func normalizePaymentBytes(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recorder := httptest.NewRecorder()
		next(recorder, r)
		for key, values := range recorder.Header() {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		if recorder.Code != 200 {
			w.WriteHeader(recorder.Code)
			_, _ = w.Write(recorder.Body.Bytes())
			return
		}
		var response map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			http.Error(w, "invalid upstream JSON", 502)
			return
		}
		if messages, ok := response["messages"].([]any); ok {
			for _, value := range messages {
				message, ok := value.(map[string]any)
				if !ok {
					continue
				}
				body, ok := message["body"].(string)
				if !ok {
					continue
				}
				var envelope map[string]any
				if json.Unmarshal([]byte(body), &envelope) != nil {
					continue
				}
				payment, ok := envelope["payment"].(map[string]any)
				if !ok {
					continue
				}
				encoded, ok := payment["tx"].(string)
				if !ok {
					continue
				}
				bytes, err := base64.StdEncoding.Strict().DecodeString(encoded)
				if err != nil {
					http.Error(w, "invalid upstream payment bytes", 502)
					return
				}
				values := make([]int, len(bytes))
				for i, b := range bytes {
					values[i] = int(b)
				}
				payment["tx"] = values
				normalized, err := json.Marshal(envelope)
				if err != nil {
					http.Error(w, "invalid upstream envelope", 502)
					return
				}
				message["body"] = string(normalized)
			}
		}
		w.Header().Del("Content-Length")
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(response)
	}
}

// sqlstore's native duplicate classifier keys on its driver name. Preserve the
// same public duplicate response for the registered deterministic-function
// driver rather than exposing a constraint rejection as an internal error.
type compatibleStore struct{ *sqlstore.Store }

func (s *compatibleStore) InsertMessage(ctx context.Context, message mbstorage.NewMessage) error {
	err := s.Store.InsertMessage(ctx, message)
	var sqliteError sqlite3.Error
	if errors.As(err, &sqliteError) && (sqliteError.ExtendedCode == sqlite3.ErrConstraintUnique || sqliteError.ExtendedCode == sqlite3.ErrConstraintPrimaryKey) {
		return mbstorage.ErrDuplicateMessage
	}
	return err
}
