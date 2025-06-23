package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Get existing collections
		taskListsCollection, err := app.FindCollectionByNameOrId("task_lists")
		if err != nil {
			return err
		}

		tasksCollection, err := app.FindCollectionByNameOrId("tasks")
		if err != nil {
			return err
		}

		// Update task_lists collection with new fields
		taskListsCollection.Fields.Add(
			&core.DateField{
				Name:     "created_at",
				Required: true,
			},
			&core.BoolField{
				Name: "pinned",
			},
			&core.BoolField{
				Name: "archived",
			},
		)

		if err := app.Save(taskListsCollection); err != nil {
			return err
		}

		// Update tasks collection with new fields
		tasksCollection.Fields.Add(
			&core.DateField{
				Name:     "created_at",
				Required: true,
			},
			&core.DateField{
				Name: "completed_at",
			},
			&core.DateField{
				Name: "deadline",
			},
			&core.DateField{
				Name: "reminder",
			},
			// Renaming the existing field from "is_completed" to "completed" for consistency
			// First, we need to add the new field
			&core.BoolField{
				Name: "completed",
			},
		)

		return app.Save(tasksCollection)
	}, func(app core.App) error {
		// The rollback function would ideally remove the added fields
		// However, we'll leave it blank for now as we don't have a clean way
		// to remove specific fields in the PocketBase API
		return nil
	})
}
