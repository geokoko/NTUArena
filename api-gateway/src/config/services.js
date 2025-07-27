const services = {
	user: process.env.USER_SERVICE_URL || 'http://user-service:3002',
	tournament: process.env.TOURNAMENT_SERVICE_URL || 'http://tournament-service:3003',
	player: process.env.PLAYER_SERVICE_URL || 'http://player-service:3004',
	game: process.env.GAME_SERVICE_URL || 'http://game-service:3005',
	pairing: process.env.PAIRING_SERVICE_URL || 'http://pairing-service:3006'
};

const serviceRoutes = {
	user: {
		path: '/api/users',
		target: services.user,
		pathRewrite: { '^/api/users': '/users' }
	},
	tournament: {
		path: '/api/tournaments',
		target: services.tournament,
		pathRewrite: { '^/api/tournaments': '/tournaments' }
	},
	player: {
		path: '/api/players',
		target: services.player,
		pathRewrite: { '^/api/players': '/players' }
	},
	game: {
		path: '/api/games',
		target: services.game,
		pathRewrite: { '^/api/games': '/games' }
	},
	pairing: {
		path: '/api/pairing',
		target: services.pairing,
		pathRewrite: { '^/api/pairing': '/pairing' }
	}
};

module.exports = {
	services,
	serviceRoutes
}; 
