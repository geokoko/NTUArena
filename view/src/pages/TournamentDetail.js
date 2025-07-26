import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentAPI, gameAPI, playerAPI } from '../services/api';
import GameBoard from '../components/GameBoard';
import './TournamentDetail.css';

const TournamentDetail = ({ user }) => {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchTournamentDetails = async () => {
      try {
        // Simulate tournament data
        const tournamentData = {
          _id: id,
          name: id === '1' ? 'Weekly Arena Championship' : 'Monthly Master Tournament',
          startDate: new Date(),
          endDate: new Date(Date.now() + 3600000 * 3),
          tournLocation: 'Online',
          tournStatus: 'active',
          participants: [user?.id].filter(Boolean),
          maxPlayers: 50,
          timeControl: '5+3',
          description: 'A competitive chess tournament for all skill levels'
        };

        const standingsData = [
          { rank: 1, player: { username: 'ChessMaster', id: '1' }, score: 8.5, games: 12 },
          { rank: 2, player: { username: 'KnightRider', id: '2' }, score: 7.0, games: 11 },
          { rank: 3, player: { username: 'PawnStorm', id: '3' }, score: 6.5, games: 10 },
        ];

        const gamesData = [
          {
            _id: '1',
            playerWhite: { username: 'ChessMaster', id: '1' },
            playerBlack: { username: 'KnightRider', id: '2' },
            isFinished: true,
            finishedAt: new Date(Date.now() - 3600000),
            resultColor: 'white'
          },
          {
            _id: '2',
            playerWhite: { username: 'PawnStorm', id: '3' },
            playerBlack: { username: 'ChessMaster', id: '1' },
            isFinished: false,
            finishedAt: null,
            resultColor: null
          }
        ];

        const playersData = [
          { username: 'ChessMaster', id: '1', score: 8.5, liveRating: 1850 },
          { username: 'KnightRider', id: '2', score: 7.0, liveRating: 1780 },
          { username: 'PawnStorm', id: '3', score: 6.5, liveRating: 1720 }
        ];

        setTournament(tournamentData);
        setStandings(standingsData);
        setGames(gamesData);
        setPlayers(playersData);
      } catch (err) {
        setError('Failed to load tournament details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTournamentDetails();
  }, [id, user?.id]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'upcoming':
        return <span className="badge badge-warning">Upcoming</span>;
      case 'active':
        return <span className="badge badge-success">Active</span>;
      case 'completed':
        return <span className="badge badge-secondary">Completed</span>;
      default:
        return <span className="badge badge-primary">{status}</span>;
    }
  };

  const getGameResultDisplay = (game) => {
    if (!game.isFinished) {
      return <span className="badge badge-warning">Ongoing</span>;
    }
    
    if (game.resultColor === 'white') {
      return <span className="badge badge-success">1-0</span>;
    } else if (game.resultColor === 'black') {
      return <span className="badge badge-success">0-1</span>;
    } else {
      return <span className="badge badge-secondary">½-½</span>;
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <div className="loading-spinner"></div>
        <p>Loading tournament details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        {error}
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="alert alert-info">
        Tournament not found
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1>{tournament.name}</h1>
          {getStatusBadge(tournament.tournStatus)}
        </div>
        <Link to="/tournaments" className="btn btn-secondary">
          Back to Tournaments
        </Link>
      </div>

      {/* Tournament Overview */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">Tournament Information</h3>
        </div>
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          <div>
            <p><strong>Location:</strong> {tournament.tournLocation}</p>
            <p><strong>Time Control:</strong> {tournament.timeControl}</p>
            <p><strong>Max Players:</strong> {tournament.maxPlayers}</p>
          </div>
          <div>
            <p><strong>Start Date:</strong> {new Date(tournament.startDate).toLocaleString()}</p>
            <p><strong>End Date:</strong> {new Date(tournament.endDate).toLocaleString()}</p>
            <p><strong>Current Players:</strong> {tournament.participants.length}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-4">
        <div className="d-flex gap-2">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('standings')}
            className={`btn ${activeTab === 'standings' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Standings
          </button>
          <button 
            onClick={() => setActiveTab('games')}
            className={`btn ${activeTab === 'games' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Games
          </button>
          <button 
            onClick={() => setActiveTab('players')}
            className={`btn ${activeTab === 'players' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Players
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Tournament Overview</h3>
          </div>
          <div>
            <p>{tournament.description}</p>
            <div className="mt-3">
              <h4>Quick Stats:</h4>
              <ul>
                <li>Total Games: {games.length}</li>
                <li>Completed Games: {games.filter(g => g.isFinished).length}</li>
                <li>Ongoing Games: {games.filter(g => !g.isFinished).length}</li>
                <li>Players: {players.length}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'standings' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Tournament Standings</h3>
          </div>
          <div>
            <table className="table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Score</th>
                  <th>Games</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing) => (
                  <tr key={standing.player.id}>
                    <td>{standing.rank}</td>
                    <td>{standing.player.username}</td>
                    <td>{standing.score}</td>
                    <td>{standing.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'games' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Tournament Games</h3>
          </div>
          <div className="row">
            {games.map((game) => (
              <div key={game._id} className="col-md-6 mb-4">
                <GameBoard
                  gameId={game._id}
                  player1={game.playerWhite.username}
                  player2={game.playerBlack.username}
                  result={getGameResultDisplay(game)}
                  isLive={!game.isFinished}
                  gameState={null} // This would come from the actual game state
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'players' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Tournament Players</h3>
          </div>
          <div>
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Score</th>
                  <th>Live Rating</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id}>
                    <td>{player.username}</td>
                    <td>{player.score}</td>
                    <td>{player.liveRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentDetail; 