// src/store.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

type LogPrinted = { [solver: string]: boolean }

type Store = {
  id: string
  finalLogPrinted: LogPrinted
}

const store: Store = {
  id: '',
  finalLogPrinted: {}
}

export default store
