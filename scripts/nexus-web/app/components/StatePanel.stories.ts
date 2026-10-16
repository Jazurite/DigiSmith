import StatePanel from './StatePanel.vue'

const meta = { title: 'Components/State panel', component: StatePanel, args: { retrying: false } }
export default meta

export const ErrorPanel = { args: { kind: 'error' } }
export const LockedPanel = { args: { kind: 'locked' } }
export const EmptyPanel = { args: { kind: 'empty' } }
export const RetryingPanel = { args: { kind: 'error', retrying: true } }
