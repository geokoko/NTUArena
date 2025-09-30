import axios from 'axios';

// Use explicit gateway URL if provided, else rely on CRA proxy via relative paths
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Create axios instance with base configuration
const api = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Normalize errors to include status and message for better UI feedback
api.interceptors.response.use(
	(response) => response,
	(error) => {
		const normalized = new Error('Request failed');
		if (error.response) {
			normalized.status = error.response.status;
			normalized.data = error.response.data;
			normalized.message =
				(error.response.data && (error.response.data.error || error.response.data.message)) ||
				`${error.response.status} ${error.response.statusText}`;
		} else if (error.request) {
			normalized.status = 0;
			normalized.message = 'Network error: no response from server';
		} else {
			normalized.message = error.message || 'Unexpected error';
		}
		return Promise.reject(normalized);
	}
);



// User API
export const userAPI = {
	getAll: () => api.get('/api/users'),
	getProfile: (userId) => api.get(`/api/users/${userId}`),
	updateProfile: (userId, userData) => api.put(`/api/users/${userId}`, userData),
	searchUsers: (query) => api.get(`/api/users/search?q=${encodeURIComponent(query)}`),
	getUserStatistics: (userId) => api.get(`/api/users/${userId}/statistics`),
	addUser: (userData) => api.post('/api/users', userData),
	deleteUser: (userId) => api.delete(`/api/users/${userId}`),
};

// Tournament API
export const tournamentAPI = {
    createTournament: (tournamentData) => api.post('/api/tournaments', tournamentData),
    getAllTournaments: () => api.get('/api/tournaments'),
    getTournament: (tournamentId) => api.get(`/api/tournaments/${tournamentId}`),
    startTournament: (tournamentId) => api.post(`/api/tournaments/${tournamentId}/start`),
    endTournament: (tournamentId) => api.post(`/api/tournaments/${tournamentId}/end`),
    getTournamentStandings: (tournamentId) => api.get(`/api/tournaments/${tournamentId}/standings`),
	joinTournament: (tournamentId, userId) => api.post(`/api/tournaments/${tournamentId}/join`, { userId }),
	leaveTournament: (tournamentId, userId) => api.post(`/api/tournaments/${tournamentId}/leave`, { userId }),
    getTournamentPlayers: (tournamentId) => api.get(`/api/tournaments/${tournamentId}/players`),
    getTournamentGames: (tournamentId) => api.get(`/api/tournaments/${tournamentId}/games`),
    getActiveTournamentGames: (tournamentId) => api.get(`/api/tournaments/${tournamentId}/active`),
};

// Player API
export const playerAPI = {
	getPlayerStats: (userId, tournamentId) => api.get(`/api/players/${userId}/${tournamentId}/stats`),
	getPlayersByTournament: (tournamentId) => api.get(`/api/players/tournament/${tournamentId}`),
	updatePlayerAfterGame: (playerId, gameData) => api.put(`/api/players/${playerId}/updateAfterGame`, gameData),
};

// Game API
export const gameAPI = {
    createFromPairing: (whitePlayerId, blackPlayerId, tournamentId) =>
        api.post(`/api/games/createFromPairing`, { whitePlayerId, blackPlayerId, tournamentId }),
    submitGameResult: (gameId, result) => api.post(`/api/games/${gameId}/submitResult`, { result }),
    getGame: (gameId) => api.get(`/api/games/${gameId}`),
    getGamesByTournament: (tournamentId) => api.get(`/api/games/tournament/${tournamentId}`),
};

// Pairing API
export const pairingAPI = {
    requestPairing: (tournamentId) => api.post('/api/pairing/request', { tournamentId }),
    getAvailablePlayers: () => api.get('/api/pairing/available-players'),
    generatePairings: (tournamentId) => api.get(`/api/pairing/generate/${tournamentId}`),
};

// Health API
export const healthAPI = {
	checkHealth: () => api.get('/health'),
	checkServicesHealth: () => api.get('/health/services'),
	checkServiceHealth: (serviceName) => api.get(`/health/services/${serviceName}`),
};

export default api; 
