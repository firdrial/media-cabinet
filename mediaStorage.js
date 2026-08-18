import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

// ---------------------------------------------------------
// NEW STORAGE KEYS (Phase 1)
// ---------------------------------------------------------
const ITEM_IDS_KEY = 'media_cabinet_item_ids';
const ITEM_KEY_PREFIX = 'media_cabinet_item_';
const ITEM_INDEX_KEY = 'media_cabinet_item_index'; // Lightweight duplicate-check index
const itemKey = id => `${ITEM_KEY_PREFIX}${id}`;

// ---------------------------------------------------------
// LEGACY STORAGE KEYS (For Migration)
// ---------------------------------------------------------
// v2 Keys (The intermediate VHS split format)
const LEGACY_SPLIT_IDS_KEY = 'vhs_tracker_tape_ids_v2';
const LEGACY_SPLIT_KEY_PREFIX = 'vhs_tracker_tape_v2_';
const legacySplitKey = id => `${LEGACY_SPLIT_KEY_PREFIX}${id}`;

// v1 Keys (The original single JSON format)
const LEGACY_COLLECTION_KEY = 'my_vhs_collection';

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------
const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const isCursorWindowError = error =>
  /Row too big to fit into CursorWindow/i.test(String(error?.message || error));

/**
 * Extracts only the lightweight fields needed for duplicate checking
 * from a full item object.
 */
function extractIndexEntry(item) {
  if (!item?.id) return null;
  return {
    id: item.id,
    title: item.title || '',
    year: item.year || '',
    externalId: item.externalId || '',
    tmdbId: item.tmdbId || '',
    collectionId: item.collectionId || null,
  };
}

/**
 * Rebuilds the lightweight index from an array of full items.
 * Used during migration or index repair.
 */
async function rebuildIndex(items) {
  const index = items
    .map(extractIndexEntry)
    .filter(Boolean);
  await AsyncStorage.setItem(ITEM_INDEX_KEY, JSON.stringify(index));
}

/**
 * Updates a single entry in the lightweight index.
 * If the item already exists in the index, it is replaced.
 * If it doesn't exist, it is appended.
 */
async function upsertIndexEntry(item) {
  const entry = extractIndexEntry(item);
  if (!entry) return;

  const indexValue = await AsyncStorage.getItem(ITEM_INDEX_KEY);
  const index = parseJson(indexValue, []);

  const existingPos = index.findIndex(e => e.id === entry.id);
  if (existingPos >= 0) {
    index[existingPos] = entry;
  } else {
    index.push(entry);
  }

  await AsyncStorage.setItem(ITEM_INDEX_KEY, JSON.stringify(index));
}

/**
 * Removes a single entry from the lightweight index by ID.
 */
async function removeIndexEntry(id) {
  const indexValue = await AsyncStorage.getItem(ITEM_INDEX_KEY);
  const index = parseJson(indexValue, []);

  const nextIndex = index.filter(e => e.id !== id);
  await AsyncStorage.setItem(ITEM_INDEX_KEY, JSON.stringify(nextIndex));
}

// ---------------------------------------------------------
// CORE FUNCTIONS
// ---------------------------------------------------------

async function getItemIds() {
  const idsValue = await AsyncStorage.getItem(ITEM_IDS_KEY);
  if (idsValue === null) {
    // If the new keys don't exist, we must migrate legacy data
    await migrateLegacyData();
    return parseJson(await AsyncStorage.getItem(ITEM_IDS_KEY), []);
  }
  return parseJson(idsValue, []);
}

async function migrateLegacyData() {
  try {
    // STEP 1: Check if already migrated to the newest format
    const newIdsValue = await AsyncStorage.getItem(ITEM_IDS_KEY);
    if (newIdsValue !== null) {
      // Already migrated — ensure index exists
      const indexValue = await AsyncStorage.getItem(ITEM_INDEX_KEY);
      if (indexValue === null) {
        const ids = parseJson(newIdsValue, []);
        if (ids.length > 0) {
          const records = await AsyncStorage.multiGet(ids.map(itemKey));
          const items = records.map(([, v]) => parseJson(v, null)).filter(Boolean);
          await rebuildIndex(items);
        } else {
          await AsyncStorage.setItem(ITEM_INDEX_KEY, JSON.stringify([]));
        }
      }
      return;
    }

    // STEP 2: Check for v2 split format ('vhs_tracker_tape_...')
    const splitIdsValue = await AsyncStorage.getItem(LEGACY_SPLIT_IDS_KEY);
    if (splitIdsValue !== null) {
      const splitIds = parseJson(splitIdsValue, []);
      
      if (Array.isArray(splitIds) && splitIds.length > 0) {
        // Read all old items using the old prefix
        const oldKeys = splitIds.map(legacySplitKey);
        const oldRecords = await AsyncStorage.multiGet(oldKeys);
        
        // Map them to the new prefix keys
        const newRecords = oldRecords
          .filter(([_, value]) => !!value)
          .map(([oldKey, value]) => {
            const id = oldKey.replace(LEGACY_SPLIT_KEY_PREFIX, '');
            return [itemKey(id), value];
          });

        // Save to new keys and index
        await AsyncStorage.multiSet([
          ...newRecords,
          [ITEM_IDS_KEY, JSON.stringify(splitIds)]
        ]);

        // Build the lightweight index from migrated items
        const migratedItems = oldRecords
          .filter(([_, value]) => !!value)
          .map(([_, value]) => parseJson(value, null))
          .filter(Boolean);
        await rebuildIndex(migratedItems);

        // Clean up old keys
        await AsyncStorage.multiRemove([...oldKeys, LEGACY_SPLIT_IDS_KEY]);
        console.info('Successfully migrated v2 split storage to media_cabinet format.');
      } else {
        // Empty v2 index, just create empty new index
        await AsyncStorage.setItem(ITEM_IDS_KEY, JSON.stringify([]));
        await AsyncStorage.setItem(ITEM_INDEX_KEY, JSON.stringify([]));
        await AsyncStorage.removeItem(LEGACY_SPLIT_IDS_KEY);
      }
      return; 
    }

    // STEP 3: Check for v1 single JSON format ('my_vhs_collection')
    const legacyValue = await AsyncStorage.getItem(LEGACY_COLLECTION_KEY);
    const legacyItems = parseJson(legacyValue, []);

    if (!legacyValue || !Array.isArray(legacyItems) || legacyItems.length === 0) {
      // Nothing to migrate, initialize empty
      await AsyncStorage.setItem(ITEM_IDS_KEY, JSON.stringify([]));
      await AsyncStorage.setItem(ITEM_INDEX_KEY, JSON.stringify([]));
      await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
      return;
    }

    // Migrate v1 to the new split format
    const ids = legacyItems.map(item => item.id).filter(Boolean);
    await AsyncStorage.multiSet([
      ...legacyItems.map(item => [itemKey(item.id), JSON.stringify(item)]),
      [ITEM_IDS_KEY, JSON.stringify(ids)],
    ]);

    // Build the lightweight index
    await rebuildIndex(legacyItems);

    await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
    console.info('Successfully migrated v1 single collection to media_cabinet format.');

  } catch (error) {
    if (!isCursorWindowError(error)) throw error;

    // Cursor window error means the legacy single JSON is too big to read on Android.
    // We can't migrate what we can't read. Initialize clean so the app doesn't crash.
    await AsyncStorage.multiSet([
      [ITEM_IDS_KEY, JSON.stringify([])],
      [ITEM_INDEX_KEY, JSON.stringify([])],
    ]);
    await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
    console.warn(
      'Removed an unreadable legacy collection that exceeded Android\'s storage row limit.'
    );
  }
}

export async function loadItems() {
  const ids = await getItemIds();
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const records = await AsyncStorage.multiGet(ids.map(itemKey));
  return records
    .map(([, value]) => parseJson(value, null))
    .filter(Boolean);
}

/**
 * Loads ONLY the lightweight metadata index for duplicate checking.
 * This reads a single small AsyncStorage key (~50 bytes per item)
 * instead of loading and parsing every full item record (~2KB+ each).
 * 
 * Returns an array of: { id, title, year, externalId, tmdbId, collectionId }
 */
export async function loadItemsIndex() {
  // Ensure migration has run
  await getItemIds();

  const indexValue = await AsyncStorage.getItem(ITEM_INDEX_KEY);
  if (indexValue === null) {
    // Index doesn't exist yet — rebuild it from full items (one-time cost)
    const items = await loadItems();
    await rebuildIndex(items);
    return items.map(extractIndexEntry).filter(Boolean);
  }
  return parseJson(indexValue, []);
}

export async function saveItem(item) {
  if (!item?.id) throw new Error('An item must have an id before it can be saved.');

  const ids = await getItemIds();
  const nextIds = ids.includes(item.id) ? ids : [...ids, item.id];
  await AsyncStorage.multiSet([
    [itemKey(item.id), JSON.stringify(item)],
    [ITEM_IDS_KEY, JSON.stringify(nextIds)],
  ]);

  // Keep the lightweight index in sync
  await upsertIndexEntry(item);
}

/**
 * Deletes all local texture files associated with an item.
 * Only targets file:// URIs (local files), ignores remote URLs.
 */
async function cleanupItemFiles(item) {
  const textureMap = item?.textureMap;
  if (!textureMap) return;

  for (const [faceKey, faceData] of Object.entries(textureMap)) {
    // Skip non-face entries like "modelId" which is just a string
    if (!faceData || typeof faceData !== 'object' || !faceData.uri) continue;

    try {
      const uri = faceData.uri;
      if (uri && uri.startsWith('file://')) {
        const file = new File(uri);
        if (file.exists) {
          file.delete();
        }
      }
    } catch (error) {
      // Log but don't block deletion — a missing file shouldn't
      // prevent the user from deleting the item
      console.warn(`Failed to delete texture for "${faceKey}":`, error);
    }
  }
}

export async function deleteItem(id) {
  // Step 1: Load the item so we can find its files
  try {
    const itemJson = await AsyncStorage.getItem(itemKey(id));
    if (itemJson) {
      const item = JSON.parse(itemJson);
      await cleanupItemFiles(item);
    }
  } catch (error) {
    console.warn('File cleanup failed for item:', id, error);
    // Continue with deletion even if cleanup fails
  }

  // Step 2: Remove from AsyncStorage
  const ids = await getItemIds();
  await AsyncStorage.multiSet([
    [ITEM_IDS_KEY, JSON.stringify(ids.filter(itemId => itemId !== id))],
  ]);
  await AsyncStorage.removeItem(itemKey(id));

  // Step 3: Remove from the lightweight index
  await removeIndexEntry(id);
}