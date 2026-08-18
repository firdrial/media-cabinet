import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

// ---------------------------------------------------------
// NEW STORAGE KEYS (Phase 1)
// ---------------------------------------------------------
const ITEM_IDS_KEY = 'media_cabinet_item_ids';
const ITEM_KEY_PREFIX = 'media_cabinet_item_';
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
    if (newIdsValue !== null) return; 

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

        // Clean up old keys
        await AsyncStorage.multiRemove([...oldKeys, LEGACY_SPLIT_IDS_KEY]);
        console.info('Successfully migrated v2 split storage to media_cabinet format.');
      } else {
        // Empty v2 index, just create empty new index
        await AsyncStorage.setItem(ITEM_IDS_KEY, JSON.stringify([]));
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
      await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
      return;
    }

    // Migrate v1 to the new split format
    const ids = legacyItems.map(item => item.id).filter(Boolean);
    await AsyncStorage.multiSet([
      ...legacyItems.map(item => [itemKey(item.id), JSON.stringify(item)]),
      [ITEM_IDS_KEY, JSON.stringify(ids)],
    ]);
    await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
    console.info('Successfully migrated v1 single collection to media_cabinet format.');

  } catch (error) {
    if (!isCursorWindowError(error)) throw error;

    // Cursor window error means the legacy single JSON is too big to read on Android.
    // We can't migrate what we can't read. Initialize clean so the app doesn't crash.
    await AsyncStorage.multiSet([[ITEM_IDS_KEY, JSON.stringify([])]]);
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

export async function saveItem(item) {
  if (!item?.id) throw new Error('An item must have an id before it can be saved.');

  const ids = await getItemIds();
  const nextIds = ids.includes(item.id) ? ids : [...ids, item.id];
  await AsyncStorage.multiSet([
    [itemKey(item.id), JSON.stringify(item)],
    [ITEM_IDS_KEY, JSON.stringify(nextIds)],
  ]);
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

  // Step 2: Remove from AsyncStorage (your existing logic)
  const ids = await getItemIds();
  await AsyncStorage.multiSet([
    [ITEM_IDS_KEY, JSON.stringify(ids.filter(itemId => itemId !== id))],
  ]);
  await AsyncStorage.removeItem(itemKey(id));
}