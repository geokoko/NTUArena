import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Create axios instance with base configuration
const api = axios.create({
	baseURL: API_BASE_URL,
	timeout: 10000,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Response interceptor to handle errors
api.interceptors.response.use(
	(response) => response,
	(error) => {
		return Promise.reject(error);
	}
);



// User API
export const userAPI = {
	getProfile: (userId) => api.get(`/api/users/${userId}`),
	updateProfile: (userId, userData) => api.put(`/api/users/${userId}`, userData),
	searchUsers: (query) => api.get(`/api/users/search?q=${query}`),
	getUserStatistics: (userId) => api.get(`/api/users/${userId}/statistics`),
	addUser: (userData) => api.post('/api/users/addUser', userData),
	deleteUser: (userId) => api.delete(`/api/users/${userId}/delete`),
};

// Tournament API
export const tournamentAPI = {
	createTournament: (tournamentData) => api.post('/api/tournaments', tournamentData),
	getTournament: (tournamentId) => api.get(`/api/tournaments/${tournamentId}`),
	startTournament: (tournamentId) => api.post(`/api/tournaments/${tournamentId}/start`),
	endTournament: (tournamentId) => api.post(`/api/tournaments/${tournamentId}/end`),
	getTournamentStandings: (tournamentId) => api.get(`/api/tournaments/${tournamentId}/standings`),
	joinTournament: (tournamentId) => api.post(`/api/tournaments/${tournamentId}/join`),
	leaveTournament: (tournamentId) => api.post(`/api/tournaments/${tournamentId}/leave`),
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
