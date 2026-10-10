export interface ClickUpUser {
  id: number;
  username: string;
  color: string;
  email: string;
  profilePicture: string;
}

export interface ClickUpAssignee extends ClickUpUser {
  initials: string;
}

export interface ClickUpStatus {
  status: string;
  id: string;
  color: string;
  type: string;
  orderindex: number;
}

export interface ClickUpList {
  id: string;
  name: string;
  access: boolean;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  hidden: boolean;
  access: boolean;
}

export type ClickUpCreatedFolder = Pick<ClickUpFolder, "id" | "name" | "hidden">;

export interface ClickUpSpace {
  id: string;
}

export interface ClickUpSharing {
  public: boolean;
  public_share_expires_on: string | null;
  public_fields: string[];
  token: string | null;
  seo_optimized: boolean;
}

export interface ClickUpDropdownOption {
  id: string;
  name: string;
  color: string | null;
  orderindex: number;
}

export interface ClickUpLabelOption {
  id: string;
  label: string;
  color: string;
  orderindex: number;
}

interface CustomFieldBase {
  id: string;
  name: string;
  type: string;
  type_config: Record<string, unknown>;
  date_created: string;
  hide_from_guests: boolean;
  required: boolean;
}

export interface AutomaticProgressField extends CustomFieldBase {
  type: 'automatic_progress';
  type_config: {
    tracking: {
      subtasks: boolean;
      checklists: boolean;
      assigned_comments: boolean;
    };
    complete_on: number;
    subtask_rollup: boolean;
  };
  value: { percent_complete: number };
}

export interface CheckboxField extends CustomFieldBase {
  type: 'checkbox';
  type_config: Record<string, never>;
  value?: boolean;
}

export interface CurrencyField extends CustomFieldBase {
  type: 'currency';
  type_config: {
    default: null;
    precision: number;
    currency_type: string;
  };
  value?: string;
  value_richtext: null;
}

export interface DropdownField extends CustomFieldBase {
  type: 'drop_down';
  type_config: {
    default: number;
    sorting: string;
    placeholder: string | null;
    new_drop_down: boolean;
    options: ClickUpDropdownOption[];
  };
  value?: number;
  value_richtext: null;
}

export interface LabelsField extends CustomFieldBase {
  type: 'labels';
  type_config: {
    sorting: string;
    options: ClickUpLabelOption[];
  };
  value?: string[];
}

export type ClickUpCustomField =
  | AutomaticProgressField
  | CheckboxField
  | CurrencyField
  | DropdownField
  | LabelsField;

export interface ClickUpTask {
  id: string;
  custom_id: string | null;
  custom_item_id: number;
  name: string;
  text_content: string;
  description: string;
  status: ClickUpStatus;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  date_done: string | null;
  archived: boolean;
  creator: ClickUpUser;
  assignees: ClickUpAssignee[];
  group_assignees: unknown[];
  watchers: ClickUpAssignee[];
  checklists: unknown[];
  tags: ClickUpTag[];
  parent: string | null;
  top_level_parent: string | null;
  priority: ClickUpPriority | null;
  due_date: string | null;
  start_date: string | null;
  points: number | null;
  time_estimate: number | null;
  custom_fields: ClickUpCustomField[];
  dependencies: unknown[];
  linked_tasks: unknown[];
  locations: unknown[];
  team_id: string;
  url: string;
  sharing: ClickUpSharing;
  permission_level: string;
  list: ClickUpList;
  project: ClickUpFolder;
  folder: ClickUpFolder;
  space: ClickUpSpace;
}

export interface ClickUpTag {
  name: string;
  tag_fg: string;
  tag_bg: string;
  creator: number;
}

export interface ClickUpPriority {
  id: string;
  priority: string;
  color: string;
  orderindex: string;
}

export interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
}

/**
 * A ClickUp custom task type, returned by GET /team/{team_id}/custom_item.
 * ClickUp's UI calls these "task types"; the API path uses "custom_item".
 * Note: the default "Task" type (id 0) is NOT returned by this endpoint.
 */
export interface ClickUpTaskType {
  id: number;
  name: string;
  name_plural: string | null;
  description: string | null;
  avatar: { source: string | null; value: string | null } | null;
}

export interface ClickUpTaskTypesResponse {
  custom_items: ClickUpTaskType[];
}

export interface ClickUpListSummary { id: string; name: string; }
export interface ClickUpFolderWithLists { id: string; name: string; lists: ClickUpListSummary[]; }
export interface ClickUpFoldersResponse { folders: ClickUpFolderWithLists[]; }
export interface ClickUpListsResponse { lists: ClickUpListSummary[]; }
export interface ClickUpFieldsResponse { fields: ClickUpCustomField[]; }
export interface ClickUpListStatusOption {
  id: string;
  status: string;
  orderindex: number;
  color: string;
  type: string;
  status_group: string;
}

export interface ClickUpListDetail {
  id: string;
  name: string;
  statuses: ClickUpListStatusOption[];
}
export interface ClickUpTaskWriteBody {
  name?: string;
  description?: string;
  start_date?: number;
  start_date_time?: boolean;
  due_date?: number;
  due_date_time?: boolean;
  time_estimate?: number;
  custom_item_id?: number;
  status?: string;
  priority?: number;
  /** Parent task id; "none" makes the task top-level again (null, "" and false are ignored by ClickUp). */
  parent?: string;
}

export interface ClickUpListWriteBody {
  name?: string;
  content?: string;
}

/** Response shape from PUT /list/{list_id}; only the fields the CLI relies on. */
export interface ClickUpUpdatedList {
  id: string;
  name: string;
  content?: string;
}

/** One entry of `status_mappings` for the v3 move-task call. Both values are status ids. */
export interface ClickUpMoveTaskStatusMapping {
  source_status: string;
  destination_status: string;
}

/** Optional body for PUT /api/v3/workspaces/{ws}/tasks/{task}/home_list/{list}. */
export interface ClickUpMoveTaskOptions {
  status_mappings?: ClickUpMoveTaskStatusMapping[];
  move_custom_fields?: boolean;
  custom_fields_to_move?: string[];
}

/** Response shape from the v3 move-task call. */
export interface ClickUpMoveTaskResponse {
  data: { task_id: string; new_list_id: string };
}

/** Response shape from POST /task/{task_id}/attachment. */
export interface ClickUpAttachment {
  id: string;
  version: string;
  date: number;
  title: string;
  extension: string;
  thumbnail_small: string | null;
  thumbnail_large: string | null;
  url: string;
}

export interface FrontdoorFieldOption {
  id: string;
  name: string;
  color: string;
  orderindex: number;
}

/** A field as GET /customFields/v2/field/{id} returns it (only what the CLI relies on). */
export interface FrontdoorField {
  id: string;
  name: string;
  type: string;
  type_config: {
    sorting?: string;
    new_drop_down?: boolean;
    options?: FrontdoorFieldOption[];
  };
  description: string | null;
  hide_from_guests: boolean;
  pinned: boolean;
  required: boolean;
  required_on_subtasks: boolean;
  private: boolean;
  permission_level: string | null;
  default_value: unknown;
  members: unknown[];
  groups: unknown[];
}

/**
 * Body of the web app's PUT /customFields/v2/field/{id} (captured 2026-10-10): the full
 * field, not a patch. Options are sent as add / update / rem, never as a plain list.
 */
export interface FrontdoorFieldPutBody {
  id: string;
  name: string;
  type_config: {
    sorting: string;
    new_drop_down: boolean;
    options: {
      add: { name: string; color: string; orderindex: number }[];
      update: FrontdoorFieldOption[];
      rem: string[];
    };
  };
  hide_from_guests: boolean;
  pinned: boolean;
  required: boolean;
  required_on_subtasks: boolean;
  description: string;
  private: boolean;
  permission_level: string | null;
  default_value: unknown;
  members: unknown[];
  groups: unknown[];
}

/** Body of the Frontdoor task type calls: the full type, not a patch. */
export interface FrontdoorTaskTypeBody {
  avatar_source: string;
  avatar_value: string;
  description: string;
  name: string;
  name_plural: string;
}

/** Where move-folder puts a folder: inside another folder, or at the top level of a space. position is optional. */
export type MoveFolderTarget =
  | { parentFolderId: string; position?: number }
  | { spaceId: string; position?: number };

/** Which side of a dependency the other task is on. */
export type DependencyRelation = { dependsOn: string } | { dependencyOf: string };
