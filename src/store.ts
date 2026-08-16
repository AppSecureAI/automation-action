// src/store.ts

type LogPrinted = { [solver: string]: boolean }

type Store = {
  id: string
  organizationId?: string
  finalLogPrinted: LogPrinted
}

const store: Store = {
  id: '',
  organizationId: undefined,
  finalLogPrinted: {}
}

export default store
