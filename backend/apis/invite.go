package apis

import (
	"net/http"
	"net/mail"

	"github.com/pocketbase/dbx"
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

		// Secure: User lookup by id (conditionally includes email for authorized viewers)
		se.Router.POST("/api/lookup-user-by-id", func(e *core.RequestEvent) error {
			// Require any authenticated context (record or admin)
			if e.Auth == nil {
				return e.UnauthorizedError("Unauthorized", nil)
			}
			data := struct {
				ID     string `json:"id"`
				ListID string `json:"listId"`
			}{}
			if err := e.BindBody(&data); err != nil {
				return e.BadRequestError("Invalid request", err)
			}
			if data.ID == "" {
				return e.BadRequestError("Missing id", nil)
			}
			// Find user record by id
			user, err := e.App.FindRecordById("users", data.ID)
			if err != nil {
				return e.NotFoundError("User not found", err)
			}

			// Start with public export
			resp := user.PublicExport() // map[string]any

			// Determine authorization for revealing email
			authorized := false

			// If authenticated as a user record, e.Auth is *core.Record
			if e.Auth != nil {
				callerId := e.Auth.Id
				// Same user can see their own email
				if callerId == data.ID {
					authorized = true
				}
				// If not same user, and listId provided, check ownership or collaboration
				if !authorized && data.ListID != "" {
					if list, err := e.App.FindRecordById("task_lists", data.ListID); err == nil {
						// Owner can see collaborators' emails
						if list.GetString("user_id") == callerId {
							authorized = true
						} else {
							// Collaborators on the same list can see each other's email
							if _, err := e.App.FindFirstRecordByFilter(
								"permissions",
								"task_list = {:list} && user_id = {:user} && (status = 'active' || status = 'invited')",
								dbx.Params{"list": data.ListID, "user": callerId},
							); err == nil {
								authorized = true
							}
						}
					}
				}
			}

			if authorized {
				// Inject email explicitly when authorized
				resp["email"] = user.GetString("email")
			}

			return e.JSON(http.StatusOK, resp)
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
