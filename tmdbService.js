const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY; 
const BASE_URL = 'https://api.themoviedb.org/3';

/* ----------------------------------------------------------
 * BARCODE SEARCH REMOVED
 * The physical barcode scanning feature has been deprecated.
 * ---------------------------------------------------------- */

export async function searchMovieByText(query) {
  try {
    const url = `${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      // Limit to top 10 results to prevent spamming the TMDB API with credit requests
      const topResults = data.results.slice(0, 10);

      // Fetch credits concurrently to get the director for the search list
      const detailedResults = await Promise.all(topResults.map(async (movie) => {
        let directorName = '';
        try {
          const creditsUrl = `${BASE_URL}/movie/${movie.id}/credits?api_key=${API_KEY}&language=en-US`;
          const creditsRes = await fetch(creditsUrl);
          if (creditsRes.ok) {
            const creditsData = await creditsRes.json();
            const director = creditsData.crew?.find(c => c.job === 'Director');
            directorName = director ? director.name : '';
          }
        } catch (err) {
          // Fail silently for individual credit fetch so the rest of the list still loads
          console.warn(`Failed to fetch credits for movie ${movie.id}`);
        }

        return {
          id: movie.id,
          source: 'TMDB',
          title: movie.title,
          director: directorName, // NEW: Added director for search list
          year: movie.release_date ? movie.release_date.split('-')[0] : 'Unknown',
          poster_path: movie.poster_path,
          coverArtUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
          found: true
        };
      }));

      return detailedResults;
    }
    return [];
  } catch (error) {
    console.error('TMDB Text Search Error:', error);
    return [];
  }
}

// Fetch comprehensive movie details including credits, genres, and financials
export async function getFullMovieDetails(movieId) {
  try {
    const url = `${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=en-US&append_to_response=credits`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Extract key crew members
    const director = data.credits?.crew?.find(c => c.job === 'Director')?.name || 'Unknown';
    const writer = data.credits?.crew?.find(c => c.job === 'Screenplay' || c.job === 'Writer' || c.job === 'Story')?.name || 'Unknown';
    
    // Extract top 6 cast members
    const topCast = data.credits?.cast?.slice(0, 6).map(c => ({ 
      name: c.name, 
      character: c.character 
    })) || [];

    // Helper to format currency
    const formatCurrency = (num) => {
      if (!num || num === 0) return 'Unknown';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
    };

    return {
      source: 'TMDB', // Standardized source identifier
      title: data.title, // Explicitly included for form compatibility
      overview: data.overview || 'No overview available.',
      tagline: data.tagline || '',
      genres: data.genres?.map(g => g.name) || [],
      budget: formatCurrency(data.budget),
      revenue: formatCurrency(data.revenue),
      productionCompanies: data.production_companies?.map(c => c.name) || [],
      director,
      writer,
      topCast,
      releaseDate: data.release_date || 'Unknown',
      runtime: data.runtime ? `${data.runtime} min` : 'Unknown',
      distributor: data.production_companies && data.production_companies.length > 0 ? data.production_companies[0].name : 'Unknown',
    };
  } catch (error) {
    console.error('TMDB Full Details Error:', error);
    return null;
  }
}

/* ============================================================
 * TV SHOW API FUNCTIONS
 * ============================================================ */

export async function searchTvShowByText(query) {
  try {
    const url = `${BASE_URL}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const topResults = data.results.slice(0, 10);

      const detailedResults = await Promise.all(topResults.map(async (show) => {
        let creatorName = '';
        try {
          // Fetch basic details to get the creator
          const detailsUrl = `${BASE_URL}/tv/${show.id}?api_key=${API_KEY}&language=en-US`;
          const detailsRes = await fetch(detailsUrl);
          if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            creatorName = detailsData.created_by?.[0]?.name || '';
          }
        } catch (err) {
          // Fail silently for individual detail fetch so the rest of the list still loads
          console.warn(`Failed to fetch details for TV show ${show.id}`);
        }

        return {
          id: show.id,
          source: 'TMDB_TV', // Distinct source identifier
          title: show.name, // Mapped to 'title' for UI compatibility
          director: creatorName, // Mapped to 'director' for search list UI compatibility
          year: show.first_air_date ? show.first_air_date.split('-')[0] : 'Unknown',
          poster_path: show.poster_path,
          coverArtUrl: show.poster_path ? `https://image.tmdb.org/t/p/w342${show.poster_path}` : null,
          found: true
        };
      }));

      return detailedResults;
    }
    return [];
  } catch (error) {
    console.error('TMDB TV Text Search Error:', error);
    return [];
  }
}

export async function getFullTvShowDetails(tvId) {
  try {
    const url = `${BASE_URL}/tv/${tvId}?api_key=${API_KEY}&language=en-US&append_to_response=credits`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    const creator = data.created_by?.[0]?.name || 'Unknown';
    
    // Extract top 6 cast members
    const topCast = data.credits?.cast?.slice(0, 6).map(c => ({ 
      name: c.name, 
      character: c.character 
    })) || [];

    return {
      source: 'TMDB_TV',
      title: data.name, // Mapped for ItemFormScreen compatibility
      overview: data.overview || 'No overview available.',
      tagline: data.tagline || '',
      genres: data.genres?.map(g => g.name) || [],
      budget: 'N/A', // TV budgets are rarely public in TMDB
      revenue: 'N/A',
      productionCompanies: data.production_companies?.map(c => c.name) || [],
      director: creator, // Mapped for ItemFormScreen compatibility
      writer: creator, 
      topCast,
      releaseDate: data.first_air_date || 'Unknown',
      runtime: data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : 'Unknown',
      distributor: data.networks?.[0]?.name || 'Unknown',
      numberOfSeasons: data.number_of_seasons,
      numberOfEpisodes: data.number_of_episodes,
    };
  } catch (error) {
    console.error('TMDB TV Full Details Error:', error);
    return null;
  }
}

/* ============================================================
 * TV SEASON & EPISODE API FUNCTIONS (For Physical Media Tracklists)
 * ============================================================ */

export async function getTvSeasonsList(tvId) {
  try {
    const url = `${BASE_URL}/tv/${tvId}?api_key=${API_KEY}&language=en-US`;
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    
    // Map seasons to a clean format. 
    // Note: TMDB uses season_number 0 for "Specials". We include it but label it clearly.
    return data.seasons.map(season => ({
      season_number: season.season_number,
      name: season.season_number === 0 ? 'Specials' : (season.name || `Season ${season.season_number}`),
      episode_count: season.episode_count,
      air_date: season.air_date || 'Unknown',
      poster_path: season.poster_path,
      coverArtUrl: season.poster_path ? `https://image.tmdb.org/t/p/w342${season.poster_path}` : null
    }));
  } catch (error) {
    console.error('TMDB Get TV Seasons List Error:', error);
    return [];
  }
}

export async function getTvSeasonEpisodes(tvId, seasonNumber) {
  try {
    const url = `${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}&language=en-US`;
    const response = await fetch(url);
    if (!response.ok) return { episodes: [], seasonCoverArtUrl: null };
    
    const data = await response.json();
    
    const episodes = data.episodes.map(ep => ({
      position: ep.episode_number.toString(),
      title: ep.name,
      duration: ep.runtime ? `${ep.runtime} min` : '',
      air_date: ep.air_date || 'Unknown',
      overview: ep.overview || '',
      still_path: ep.still_path ? `https://image.tmdb.org/t/p/w342${ep.still_path}` : null,
      season: seasonNumber // <-- ADDED: Crucial for grouping/collapsing in ItemDetailScreen
    }));

    // NEW: Extract the season-specific poster path
    const seasonCoverArtUrl = data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;

    return { episodes, seasonCoverArtUrl };
  } catch (error) {
    console.error(`TMDB Get TV Season ${seasonNumber} Episodes Error:`, error);
    return { episodes: [], seasonCoverArtUrl: null };
  }
}

// NEW: Fetch all episodes for a "Complete Series" release
export async function getAllTvEpisodes(tvId, seasonsList) {
  try {
    // Filter out season 0 (Specials) unless you specifically want them in the complete run
    // Here we include all seasons that have episodes
    const validSeasons = seasonsList.filter(s => s.episode_count > 0);
    
    const allEpisodesPromises = validSeasons.map(season => 
      getTvSeasonEpisodes(tvId, season.season_number)
    );
    
    const episodesBySeason = await Promise.all(allEpisodesPromises);
    
    // Flatten into a single tracklist, handling the new { episodes, seasonCoverArtUrl } return structure
    const allEpisodes = episodesBySeason.flatMap(data => data.episodes || []);
    
    return allEpisodes;
  } catch (error) {
    console.error('TMDB Get All TV Episodes Error:', error);
    return [];
  }
}