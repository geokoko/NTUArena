import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
	baseURL: API_BASE_URL,
	timeout: 20000,
	headers: { 'Content-Type': 'application/json' },
});

// Normalize errors -> { status, message }
api.interceptors.response.use(
	(res) => res,
	(err) => {
		const status = err.response?.status ?? 0;
		const message = err.response?.data?.error || err.message || 'Request failed';
		return Promise.reject({ status, message });
	}
);

/** ---------------- Health ---------------- **/
export const healthAPI = {
	checkHealth: () => api.get('/health'),
};

/** ---------------- Users ---------------- **/
export const userAPI = {
	getAll:        ()         => api.get('/api/users'),
	getById:       (id)       => api.get(`/api/users/${id}`),
	addUser:       (data)     => api.post('/api/users', data),
	updateUser:    (id, data) => api.patch(`/api/users/${id}`, data),
	deleteUser:    (id)       => api.delete(`/api/users/${id}`),
};

/** -------------- Tournaments -------------- **/
export const tournamentAPI = {
	// Reads
	getAllTournaments:     ()    => api.get('/api/tournaments'),
	getTournament:         (id)  => api.get(`/api/tournaments/${id}`),
	getTournamentPlayers:  (id)  => api.get(`/api/tournaments/${id}/players`),
	getTournamentGames:    (id)  => api.get(`/api/tournaments/${id}/games`),  
	getTournamentStandings:(id)  => api.get(`/api/tournaments/${id}/standings`),

	// CRUD / lifecycle
	createTournament: (data)     => api.post('/api/tournaments', data),
	updateTournament: (id, data) => api.patch(`/api/tournaments/${id}`, data),
	deleteTournament: (id)       => api.delete(`/api/tournaments/${id}`),
	startTournament:  (id)       => api.post(`/api/tournaments/${id}/start`),
	endTournament:    (id)       => api.post(`/api/tournaments/${id}/end`),

	// Membership (explicit userId body)
	joinTournament:  (id, userId) => api.post(`/api/tournaments/${id}/join`,  { userId }),
	leaveTournament: (id, userId) => api.post(`/api/tournaments/${id}/leave`, { userId }),
};

/** ---------------- Games ---------------- **/
export const gameAPI = {
	getGame:           (id)     => api.get(`/api/games/${id}`),
	submitGameResult:  (id, result) => api.post(`/api/games/${id}/result`, { result }),
};

export default api;

