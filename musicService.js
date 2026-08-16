import { Buffer } from 'buffer';

// ──────────────────────────────────────────────────
// API CREDENTIALS (from .env)
// ──────────────────────────────────────────────────
const DISCOGS_API_TOKEN = process.env.EXPO_PUBLIC_DISCOGS_TOKEN;
const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET;

const USER_AGENT = 'MediaCabinetApp/1.0 +https://github.com/firdrial/media-cabinet';

const DISCOGS_BASE_URL = 'https://api.discogs.com';
const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2';
const CAA_BASE_URL = 'https://coverartarchive.org';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

// ──────────────────────────────────────────────────
// SPOTIFY TOKEN CACHE
// ──────────────────────────────────────────────────
let cachedSpotifyToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyAccessToken() {
  if (cachedSpotifyToken && Date.now() < spotifyTokenExpiry) {
    return cachedSpotifyToken;
  }

  try {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      console.error('❌ Missing Spotify Client ID or Secret in .env file!');
      return null;
    }

    const credentials = Buffer.from(
      `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('❌ Spotify auth failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    cachedSpotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedSpotifyToken;
  } catch (error) {
    console.warn('❌ Spotify auth error:', error);
    return null;
  }
}

// ──────────────────────────────────────────────────
// DISCOGS HELPERS
// ──────────────────────────────────────────────────
function getDiscogsHeaders() {
  return {
    'User-Agent': USER_AGENT,
    'Authorization': `Discogs token=${DISCOGS_API_TOKEN}`,
    'Accept': 'application/json',
  };
}

// ──────────────────────────────────────────────────
// SEARCH: Spotify (Clean, no duplicate pressings)
// ──────────────────────────────────────────────────
export async function searchAlbumByText(query) {
  try {
    const token = await getSpotifyAccessToken();
    if (!token) {
      console.error('No Spotify token available');
      return [];
    }

    // 1. Sanitize query: remove quotes that break Spotify's search parser
    const cleanQuery = query.replace(/["']/g, '').trim();
    if (!cleanQuery) return [];

    // 2. Construct URL with market=US to ensure consistent results
    const searchUrl = `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(cleanQuery)}&type=album&limit=10&market=US`;
    console.log('🔍 Spotify Search URL:', searchUrl);

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Spotify Search Error: ${response.status}`, errorText);
      return [];
    }

    const data = await response.json();

    if (data.albums?.items?.length > 0) {
      return data.albums.items.map(album => {
        // NEW: Extract and join artist names from Spotify for the search list
        const artistNames = album.artists?.map(a => a.name).join(', ') || 'Unknown Artist';

        return {
          id: album.id,
          source: 'Spotify',
          title: album.name,
          artist: artistNames, // Pass artist to UI
          year: album.release_date ? album.release_date.split('-')[0] : 'Unknown',
          poster_path: null,
          coverArtUrl: album.images?.[0]?.url || null,
          found: true,
        };
      });
    }
    return [];
  } catch (error) {
    console.error('Spotify Text Search Error:', error);
    return [];
  }
}

// ──────────────────────────────────────────────────
// COVER ART FALLBACKS
// ──────────────────────────────────────────────────
async function fetchMusicBrainzCoverArt(artist, title) {
  try {
    const query = encodeURIComponent(`artist:"${artist}" AND release:"${title}"`);
    const searchUrl = `${MUSICBRAINZ_BASE_URL}/release-group/?query=${query}&fmt=json&limit=1`;

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data['release-groups'] && data['release-groups'].length > 0) {
      const mbid = data['release-groups'][0].id;
      return `${CAA_BASE_URL}/release-group/${mbid}/front-500`;
    }
    return null;
  } catch (error) {
    console.warn('MusicBrainz cover art error:', error);
    return null;
  }
}

// ──────────────────────────────────────────────────
// DISCOGS ENRICHMENT (Label, Writers, Vinyl Tracklist, Album Type, Cover Art Fallback)
// ──────────────────────────────────────────────────
async function fetchDiscogsEnrichmentData(artist, title) {
  try {
    const searchUrl = `${DISCOGS_BASE_URL}/database/search?q=${encodeURIComponent(`${artist} ${title}`)}&type=release&per_page=15`;
    const searchResponse = await fetch(searchUrl, { headers: getDiscogsHeaders() });

    if (!searchResponse.ok) {
      return { coverArt: null, label: '', writers: '', sidesTracklist: null, albumType: null };
    }

    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      return { coverArt: null, label: '', writers: '', sidesTracklist: null, albumType: null };
    }

    // 1. Hunt for a physical vinyl/cassette release for tracklist purposes
    let vinylReleaseId = null;
    for (const result of searchData.results) {
      const isPhysicalSideFormat = result.format?.some(f => 
        f.includes('Vinyl') || f.includes('Cassette') || f.includes('Shellac')
      );
      if (isPhysicalSideFormat) {
        vinylReleaseId = result.id;
        break; 
      }
    }

    // 2. Fallback to top result for metadata (label, writers) if no vinyl found
    const targetReleaseId = vinylReleaseId || searchData.results[0].id;
    let fallbackCoverArt = searchData.results[0].cover_image || searchData.results[0].thumb || null;

    const detailsUrl = `${DISCOGS_BASE_URL}/releases/${targetReleaseId}`;
    const detailsResponse = await fetch(detailsUrl, { headers: getDiscogsHeaders() });

    if (!detailsResponse.ok) {
      return { coverArt: fallbackCoverArt, label: '', writers: '', sidesTracklist: null, albumType: null };
    }

    const releaseData = await detailsResponse.json();
    
    // Extract Cover Art from details
    const primaryImage = releaseData.images?.find(img => img.type === 'primary') || releaseData.images?.[0];
    const detailsCoverArt = primaryImage?.uri || releaseData.thumb || fallbackCoverArt;

    // Extract Label
    const label = releaseData.labels?.[0]?.name || '';

    // Extract Writers/Producers
    const writers = releaseData.extraartists
      ?.filter(a => ['Producer', 'Written-By', 'Composed By', 'Lyrics By', 'Songwriter'].includes(a.role))
      .map(a => a.name)
      .filter((value, index, self) => self.indexOf(value) === index) // remove duplicates
      .join(', ') || '';

    // Extract Tracklist if side-based
    let sidesTracklist = null;
    const isSideBased = releaseData.formats?.some(f => 
      ['Vinyl', 'Cassette', 'Shellac', 'Flexi-disc'].includes(f.name)
    );
    
    if (isSideBased && releaseData.tracklist && releaseData.tracklist.length > 0) {
      sidesTracklist = releaseData.tracklist.map((track, index) => ({
        title: track.title,
        duration: track.duration || '',
        position: track.position || `${index + 1}`,
      }));
    }

    // --- NEW: Extract Accurate Album Type (LP, EP, Single) ---
    let albumType = null;
    if (releaseData.formats) {
      const allDescriptions = releaseData.formats.flatMap(f => [f.name, ...(f.descriptions || [])]).join(' ').toLowerCase();
      if (allDescriptions.includes('ep')) {
        albumType = 'EP';
      } else if (allDescriptions.includes('single')) {
        albumType = 'Single';
      } else if (allDescriptions.includes('lp')) {
        albumType = 'LP';
      }
    }

    return {
      coverArt: detailsCoverArt,
      label,
      writers,
      sidesTracklist,
      albumType
    };

  } catch (error) {
    console.warn('Discogs enrichment error:', error);
    return { coverArt: null, label: '', writers: '', sidesTracklist: null, albumType: null };
  }
}

// ──────────────────────────────────────────────────
// HELPER: Format milliseconds to mm:ss
// ──────────────────────────────────────────────────
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────
// FULL DETAILS: Spotify primary, Discogs for enrichment
// ──────────────────────────────────────────────────
export async function getFullAlbumDetails(albumId) {
  try {
    const token = await getSpotifyAccessToken();
    if (!token) return null;

    // Fetch album metadata from Spotify
    const albumUrl = `${SPOTIFY_API_URL}/albums/${albumId}?market=US`;
    const albumResponse = await fetch(albumUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!albumResponse.ok) {
      const errorText = await albumResponse.text();
      console.error(`❌ Spotify Album Details Error: ${albumResponse.status}`, errorText);
      return null;
    }
    const albumData = await albumResponse.json();

    // Fetch sequential tracklist from Spotify
    let spotifyTracklist = [];
    let totalSeconds = 0;
    
    if (albumData.tracks?.items?.length > 0) {
      spotifyTracklist = albumData.tracks.items.map((track, index) => {
        const durationStr = formatDuration(track.duration_ms);
        const parts = durationStr.split(':').map(Number);
        totalSeconds += parts[0] * 60 + parts[1];
        
        return {
          title: track.name,
          duration: durationStr,
          position: `${index + 1}`,
        };
      });
    }

    const artists = albumData.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
    const albumTitle = albumData.name;
    const releaseDate = albumData.release_date || 'Unknown';
    const genres = albumData.genres || [];
    
    const runtime = totalSeconds > 0 
      ? `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`
      : 'Unknown';

    // 1. COVER ART: Spotify
    let coverArtUrl = albumData.images?.[0]?.url || null;
    
    // 2. COVER ART FALLBACK: MusicBrainz
    if (!coverArtUrl) {
      console.log(`[Artwork] Spotify has no art for "${albumTitle}", trying MusicBrainz`);
      coverArtUrl = await fetchMusicBrainzCoverArt(artists, albumTitle);
    }
    
    // 3. ENRICHMENT: Discogs (Label, Writers, Vinyl Tracklist, Album Type, Cover Art Fallback)
    const discogsData = await fetchDiscogsEnrichmentData(artists, albumTitle);

    // 4. COVER ART FALLBACK: Discogs
    if (!coverArtUrl && discogsData.coverArt) {
      console.log(`[Artwork] MusicBrainz has no art for "${albumTitle}", using Discogs fallback`);
      coverArtUrl = discogsData.coverArt;
    }

    // Map Label and Writers from Discogs (fallback to Spotify label if Discogs has none)
    const label = discogsData.label || albumData.label || 'Unknown';
    const writers = discogsData.writers || '';

    // --- NEW: Determine Accurate Album Type ---
    let albumType = discogsData.albumType;
    if (!albumType) {
       // Fallback to Spotify if Discogs didn't specify EP/Single/LP
       if (albumData.album_type === 'ep') albumType = 'EP';
       else if (albumData.album_type === 'single') albumType = 'Single';
       else albumType = 'Album';
    }

    return {
      source: 'Spotify',
      title: albumTitle,
      coverArtUrl,
      overview: '', // Clean - no pressing info
      tagline: '',  // Clean - no catalog number
      genres,
      productionCompanies: label !== 'Unknown' ? [label] : [],
      director: artists, // Maps to Artist
      writer: writers,   // Maps to Producer/Writer
      releaseDate,
      runtime,
      distributor: label, // Maps to Record Label
      tracklist: spotifyTracklist, // Default to Spotify sequential
      tracklistStyle: 'sequential',
      sidesTracklist: discogsData.sidesTracklist, // Vinyl tracklist for frontend to swap if needed
      formats: [albumType], // Maps to accurate LP/EP/Single chip in UI
      country: albumData.available_markets?.[0] || 'Unknown',
    };
  } catch (error) {
    console.error('Spotify Full Details Error:', error);
    return null;
  }
}