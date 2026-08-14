import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage on Android stores each value in a SQLite row. Keeping the
// collection in one JSON value eventually exceeds CursorWindow's row limit,
// especially when a tape has 3D scan images. Store a small index plus one
// record per tape instead.
const LEGACY_COLLECTION_KEY = 'my_vhs_collection';
const TAPE_IDS_KEY = 'vhs_tracker_tape_ids_v2';
const TAPE_KEY_PREFIX = 'vhs_tracker_tape_v2_';

const tapeKey = id => `${TAPE_KEY_PREFIX}${id}`;

const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const isCursorWindowError = error =>
  /Row too big to fit into CursorWindow/i.test(String(error?.message || error));

async function getTapeIds() {
  const idsValue = await AsyncStorage.getItem(TAPE_IDS_KEY);
  if (idsValue === null) {
    await migrateLegacyCollection();
    return parseJson(await AsyncStorage.getItem(TAPE_IDS_KEY), []);
  }
  return parseJson(idsValue, []);
}

async function migrateLegacyCollection() {
  try {
    const legacyValue = await AsyncStorage.getItem(LEGACY_COLLECTION_KEY);
    const legacyTapes = parseJson(legacyValue, []);

    if (!legacyValue || !Array.isArray(legacyTapes)) {
      await AsyncStorage.setItem(TAPE_IDS_KEY, JSON.stringify([]));
      return [];
    }

    const ids = legacyTapes.map(tape => tape.id).filter(Boolean);
    await AsyncStorage.multiSet([
      ...legacyTapes.map(tape => [tapeKey(tape.id), JSON.stringify(tape)]),
      [TAPE_IDS_KEY, JSON.stringify(ids)],
    ]);
    await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
    return legacyTapes;
  } catch (error) {
    if (!isCursorWindowError(error)) throw error;

    // The old single-row value cannot be read by Android at all, so it cannot
    // be migrated in JavaScript. Remove only that unusable legacy value and
    // initialize the new layout so the app can be used again.
    await AsyncStorage.multiSet([[TAPE_IDS_KEY, JSON.stringify([])]]);
    await AsyncStorage.removeItem(LEGACY_COLLECTION_KEY);
    console.warn(
      'Removed an unreadable legacy collection that exceeded Android\'s storage row limit.'
    );
    return [];
  }
}

export async function loadTapes() {
  const idsValue = await AsyncStorage.getItem(TAPE_IDS_KEY);
  if (idsValue === null) return migrateLegacyCollection();

  const ids = parseJson(idsValue, []);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const records = await AsyncStorage.multiGet(ids.map(tapeKey));
  return records
    .map(([, value]) => parseJson(value, null))
    .filter(Boolean);
}

export async function saveTape(tape) {
  if (!tape?.id) throw new Error('A tape must have an id before it can be saved.');

  const ids = await getTapeIds();
  const nextIds = ids.includes(tape.id) ? ids : [...ids, tape.id];
  await AsyncStorage.multiSet([
    [tapeKey(tape.id), JSON.stringify(tape)],
    [TAPE_IDS_KEY, JSON.stringify(nextIds)],
  ]);
}

export async function deleteTape(id) {
  const ids = await getTapeIds();
  await AsyncStorage.multiSet([
    [TAPE_IDS_KEY, JSON.stringify(ids.filter(tapeId => tapeId !== id))],
  ]);
  await AsyncStorage.removeItem(tapeKey(id));
}
