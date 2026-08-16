const API_TOKEN = 'TNyxGcSPnBooEPxHDPZGSBkkYtddQObLdibCxTOk';
// A unique User-Agent is required by Discogs API rules to avoid being blocked
const USER_AGENT = 'MediaCabinetApp/1.0 +https://github.com/firdrial/media-cabinet';
const BASE_URL = 'https://api.discogs.com';

// Helper to construct headers for Discogs requests
function getHeaders() {
  return {
    'User-Agent': USER_AGENT,
    'Authorization': `Discogs token=${API_TOKEN}`,
    'Accept': 'application/json',
  };
}

export async function searchAlbumByText(query) {
  try {
    // type=release ensures we search for specific physical pressings (which have unique artwork)
    const url = `${BASE_URL}/database/search?q=${encodeURIComponent(query)}&type=release`;
    const response = await fetch(url, { headers: getHeaders() });
    
    if (!response.ok) {
      console.error('Discogs Search Error:', response.status);
      return [];
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      return data.results.map(release => ({
        id: release.id,
        source: 'Discogs', // Standardized source identifier
        title: release.title,
        year: release.year || 'Unknown',
        poster_path: null, // Discogs uses fully qualified URLs, but keeping key for structural parity
        coverArtUrl: release.cover_image || release.thumb || null, 
        found: true,
        // Store a preview of formats so the user knows if it's a vinyl, CD, cassette, etc.
        formatPreview: release.format ? release.format.join(', ') : 'Unknown Format'
      }));
    }
    return [];
  } catch (error) {
    console.error('Discogs Text Search Error:', error);
    return [];
  }
}

export async function getFullAlbumDetails(releaseId) {
  try {
    const url = `${BASE_URL}/releases/${releaseId}`;
    const response = await fetch(url, { headers: getHeaders() });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Extract primary cover art (fall back to thumbnail if full image array is missing)
    const primaryImage = data.images?.find(img => img.type === 'primary') || data.images?.[0];
    const coverArtUrl = primaryImage ? primaryImage.uri : (data.thumb || null);

    // Extract primary artists
    const artists = data.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
    
    // Extract producers/writers from extra artists
    const writers = data.extraartists
      ?.filter(a => ['Producer', 'Written-By', 'Composed By', 'Lyrics By'].includes(a.role))
      .map(a => a.name)
      .filter((value, index, self) => self.indexOf(value) === index) // remove duplicates
      .join(', ') || 'Unknown';

    // Extract labels and catalog number
    const labels = data.labels?.map(l => l.name) || [];
    const catalogNumber = data.labels?.[0]?.catno || '';

    // Compute runtime from tracklist (e.g., "45:30")
    let runtime = 'Unknown';
    if (data.tracklist && data.tracklist.length > 0) {
      let totalSeconds = 0;
      data.tracklist.forEach(track => {
        if (track.duration && track.duration.includes(':')) {
          const [min, sec] = track.duration.split(':').map(Number);
          if (!isNaN(min) && !isNaN(sec)) {
            totalSeconds += min * 60 + sec;
          }
        }
      });
      if (totalSeconds > 0) {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        runtime = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    }

    // Combine Genres & Styles into one array
    const genres = [
      ...(data.genres || []),
      ...(data.styles || [])
    ];

    // Determine tracklist style based on physical format from Discogs
    const isSideBasedFormat = data.formats?.some(f => 
      ['Vinyl', 'Cassette', 'Shellac', 'Flexi-disc'].includes(f.name)
    );
    const tracklistStyle = isSideBasedFormat ? 'sides' : 'sequential';

    // Normalize tracklist positions
    const tracklist = (data.tracklist || []).map((track, index) => {
      if (tracklistStyle === 'sequential') {
        // Force standard 1, 2, 3 numbering for CDs
        return {
          ...track,
          position: `${index + 1}`,
        };
      } else {
        // Preserve A1, B1 tags, fallback to index if Discogs user left it blank
        return {
          ...track,
          position: track.position || `${index + 1}`,
        };
      }
    });

    return {
      source: 'Discogs', // Standardized source identifier
      coverArtUrl,
      overview: data.notes || 'No notes available for this specific pressing.',
      tagline: catalogNumber, // We will map "Catalog #" to the Tagline field in the form
      genres,
      productionCompanies: labels,
      director: artists,     // Map primary artists to the "Director" field for now
      writer: writers,       // Map producers/writers to the "Writer" field
      releaseDate: data.released_formatted || data.year?.toString() || 'Unknown',
      runtime,
      distributor: labels.join(', ') || 'Unknown',
      
      // Music-specific fields
      tracklist, // Now normalized!
      tracklistStyle, // Passed down to UI for conditional rendering
      formats: data.formats?.map(f => f.name + (f.descriptions ? ` (${f.descriptions.join(', ')})` : '')) || [],
      country: data.country || 'Unknown',
    };
  } catch (error) {
    console.error('Discogs Full Details Error:', error);
    return null;
  }
}