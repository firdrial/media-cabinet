const API_KEY = '020057186e8943fec38cb00a4b111a17'; 
// TODO: Move API_KEY to .env file for better security in a future update
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
      return data.results.map(movie => ({
        id: movie.id,
        source: 'TMDB', // Standardized source identifier for UI routing
        title: movie.title,
        year: movie.release_date ? movie.release_date.split('-')[0] : 'Unknown',
        poster_path: movie.poster_path,
        coverArtUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
        found: true
      }));
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