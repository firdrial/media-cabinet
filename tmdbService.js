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