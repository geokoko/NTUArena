function justPlayedTogether(player1, player2) {
  return player1.recentOpponents.has(player2.id) || player2.recentOpponents.has(player1.id);
}

