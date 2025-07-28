package apis

import (
	"net/http"
	"net/mail"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

// RegisterApiRoutes registers custom API endpoints for user lookup and invite email.
func RegisterApiRoutes(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// User lookup by email
		se.Router.POST("/api/lookup-user-by-email", func(e *core.RequestEvent) error {
			data := struct {
				Email string `json:"email"`
			}{}
			if err := e.BindBody(&data); err != nil {
				return e.BadRequestError("Invalid request", err)
			}
			user, err := e.App.FindAuthRecordByEmail("users", data.Email)
			if err != nil {
				return e.NotFoundError("User not found", err)
			}
			return e.JSON(http.StatusOK, user.PublicExport())
		})

		// Send invite email endpoint
		se.Router.POST("/api/send-invite-email", func(e *core.RequestEvent) error {
			data := struct {
				ToEmail string `json:"toEmail"`
				Subject string `json:"subject"`
				Body    string `json:"body"`
			}{}
			if err := e.BindBody(&data); err != nil {
				return e.BadRequestError("Invalid request", err)
			}
			message := &mailer.Message{
				From: mail.Address{
					Address: e.App.Settings().Meta.SenderAddress,
					Name:    e.App.Settings().Meta.SenderName,
				},
				To:      []mail.Address{{Address: data.ToEmail}},
				Subject: data.Subject,
				HTML:    data.Body,
			}
			if err := e.App.NewMailClient().Send(message); err != nil {
				return e.InternalServerError("Failed to send email", err)
			}
			return e.JSON(http.StatusOK, map[string]any{"success": true})
		})

		return se.Next()
	})
}
