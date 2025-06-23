package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create task_lists collection
		taskListsCollection := core.NewBaseCollection("task_lists")

		// Set collection rules
		taskListsCollection.ListRule = types.Pointer("@request.auth.id = user_id")
		taskListsCollection.ViewRule = types.Pointer("@request.auth.id = user_id")
		taskListsCollection.CreateRule = types.Pointer("@request.auth.id != ''")
		taskListsCollection.UpdateRule = types.Pointer("@request.auth.id = user_id")
		taskListsCollection.DeleteRule = types.Pointer("@request.auth.id = user_id")

		// Add fields to task_lists collection
		taskListsCollection.Fields.Add(
			&core.RelationField{
				Name:          "user_id",
				Required:      true,
				CollectionId:  "_pb_users_auth_",
				CascadeDelete: true,
			},
			&core.TextField{
				Name:     "title",
				Required: true,
				Max:      255,
			},
			&core.TextField{
				Name: "color",
				Max:  7,
			},
		)

		if err := app.Save(taskListsCollection); err != nil {
			return err
		}

		// Create tasks collection
		tasksCollection := core.NewBaseCollection("tasks")

		// Set collection rules
		tasksListRule := "@request.auth.id = task_list_id.user_id"
		tasksCollection.ListRule = types.Pointer(tasksListRule)
		tasksCollection.ViewRule = types.Pointer(tasksListRule)
		tasksCollection.CreateRule = types.Pointer("@request.auth.id != ''")
		tasksCollection.UpdateRule = types.Pointer(tasksListRule)
		tasksCollection.DeleteRule = types.Pointer(tasksListRule)

		// Add fields to tasks collection
		tasksCollection.Fields.Add(
			&core.RelationField{
				Name:          "task_list_id",
				Required:      true,
				CollectionId:  taskListsCollection.Id,
				CascadeDelete: true,
			},
			&core.TextField{
				Name:     "title",
				Required: true,
				Max:      255,
			},
			&core.TextField{
				Name: "description",
			},
			&core.DateField{
				Name: "due_date",
			},
			&core.DateField{
				Name: "remind_date",
			},
			&core.BoolField{
				Name: "is_completed",
			},
		)

		return app.Save(tasksCollection)
	}, func(app core.App) error {
		// The delete order is important due to the relation
		if collection, err := app.FindCollectionByNameOrId("tasks"); err == nil {
			if err := app.Delete(collection); err != nil {
				return err
			}
		}

		if collection, err := app.FindCollectionByNameOrId("task_lists"); err == nil {
			if err := app.Delete(collection); err != nil {
				return err
			}
		}

		return nil
	})
}
