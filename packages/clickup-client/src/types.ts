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

export interface FrontdoorOptionAdd {
  name: string;
  color: string;
  orderindex: number;
}

/**
 * The full body ClickUp's own web app sends to its undocumented
 * PUT /customFields/v2/field/{id} endpoint. The public API never returns
 * enough to reconstruct this.
 */
export interface FrontdoorFieldPutBody {
  id: string;
  name: string;
  type: 'drop_down';
  type_config: {
    default: number;
    sorting: string;
    placeholder: string | null;
    new_drop_down: boolean;
    options: {
      add: FrontdoorOptionAdd[];
      update: [];
      rem: [];
    };
  };
  userid: string;
  date_created: string;
  hide_from_guests: boolean;
  team_id: string;
  deleted: false;
  date_deleted: null;
  required: boolean;
  required_on_subtasks: false;
  private: false;
  pinned: true;
  default_value: null;
  teams: { id: string; name: string; entity: 'team'; applied_objects: null }[];
  values_set: null;
  description: '';
  deleted_by: null;
  linked_subcategory: null;
  permission_level: null;
  type_id: 1;
  automation_count: 0;
  members: [];
  groups: [];
}
