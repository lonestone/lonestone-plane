/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CoreRootStore } from "@/store/root.store";

/**
 * Lonestone edition root store.
 *
 * Extend CoreRootStore here with Lonestone-only stores (templates, etc.).
 * Instantiated via StoreProvider — do not construct CoreRootStore directly in app code.
 */
export class RootStore extends CoreRootStore {
  
}
