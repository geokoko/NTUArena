import React from 'react';
import { FaInstagram, FaFacebook, FaTwitch, FaEnvelope } from 'react-icons/fa';
import { SiLichess } from 'react-icons/si';
import DynamicEffects from '../components/DynamicEffects';
import Card from '../components/Card';

import './Home.css';

const Home = () => {
	return (
		<div className="text-center">
			<div className="content-overlay">
				<DynamicEffects effectType="crown">
					<Card style={{
						maxWidth: '600px',
						margin: '50px auto'
					}}>
						<Card.Header>
							<Card.Title as="h1">Welcome to NTUArena</Card.Title>
							<p className="text-muted">Powered by Skaki NTUA - Le Roi</p>
						</Card.Header>
						<div>
							<p className="mb-4">
								Organize and manage real-time, Arena-style chess tournaments with ease.
							</p>
							<div className="mb-4">
								<h3>Features:</h3>
								<ul className="text-left" style={{ maxWidth: '400px', margin: '0 auto' }}>
									<li>Real-time, Arena-style tournament management</li>
									<li>Automated player pairing based on multiple criteria, such as Elo, performance, and more</li>
									<li>Live standings and statistics</li>
									<li>Player profiles and game history with Elo tracking</li>
								</ul>
							</div>
						</div>
					</Card>
				</DynamicEffects>
				<div className="mt-5">
					<Card>
						<Card.Header>
							<Card.Title as="h2">How It Works</Card.Title>
						</Card.Header>
						<div className="d-flex justify-content-around flex-wrap gap-3">
							<div style={{ flex: '1', minWidth: '200px' }}>
								<h4>1. Browse Tournaments</h4>
								<p className="text-muted">View available tournaments and their details</p>
							</div>
							<div style={{ flex: '1', minWidth: '200px' }}>
								<h4>2. Join Tournament</h4>
								<p className="text-muted">Register for tournaments you want to participate in</p>
							</div>
							<div style={{ flex: '1', minWidth: '200px' }}>
								<h4>3. Play & Compete</h4>
								<p className="text-muted">Get paired with opponents automatically and compete in real-time, OTB games</p>
							</div>
							<div style={{ flex: '1', minWidth: '200px' }}>
								<h4>4. Track Progress</h4>
								<p className="text-muted">Monitor your performance and view live standings</p>
							</div>
							<div style={{ flex: '1', minWidth: '200px' }}>
								<h4>5. Review Games</h4>
								<p className="text-muted">Analyze your games and improve your skills</p>
							</div>
						</div>
					</Card>
				</div>

				{/* Social Media Links */}
				<div className="home-social-info">
					<a 
						href="https://www.instagram.com/skakintua/" 
						target="_blank" 
						rel="noopener noreferrer"
						className="home-social-link instagram"
						title="Follow us on Instagram"
					>
						<FaInstagram size={24} />
					</a>
					<a 
						href="https://www.facebook.com/skakintua" 
						target="_blank" 
						rel="noopener noreferrer"
						className="home-social-link facebook"
						title="Like us on Facebook"
					>
						<FaFacebook size={24} />
					</a>
					<a 
						href="https://www.twitch.tv/skakintua" 
						target="_blank" 
						rel="noopener noreferrer"
						className="home-social-link twitch"
						title="Watch us on Twitch"
					>
						<FaTwitch size={24} />
					</a>
					<a 
						href="https://lichess.org/@/skakintua" 
						target="_blank" 
						rel="noopener noreferrer"
						className="home-social-link lichess"
						title="Play with us on Lichess"
					>
						<SiLichess size={24} />
					</a>
					<a 
						href="mailto:skaki@ntua.gr" 
						className="home-social-link email"
						title="Contact us via email"
					>
						<FaEnvelope size={24} />
					</a>
				</div>
			</div>
		</div>
	);
};

export default Home;
