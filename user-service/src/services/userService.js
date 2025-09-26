const User = require('../models/User');
const rabbitmq = require('../utils/rabbitmq');

class UserService {
    constructor() {
        this.initializeEventHandlers();
    }

    async initializeEventHandlers() {
        // Listen for user creation events from auth service
        await rabbitmq.consumeEvents('user_events', 'user.created', this.handleUserCreated.bind(this));
        
        // Listen for game events to update statistics
        await rabbitmq.consumeEvents('game_events', 'game.finished', this.handleGameFinished.bind(this));
        
        // Listen for tournament events to update statistics
        await rabbitmq.consumeEvents('tournament_events', 'tournament.joined', this.handleTournamentJoined.bind(this));
        await rabbitmq.consumeEvents('tournament_events', 'tournament.completed', this.handleTournamentCompleted.bind(this));
    }

    async handleUserCreated(message) {
        try {
            const { userId, username, email, role, globalElo, registeredAt } = message.data;
            
            // Create user in user service database
            const user = new User({
                _id: userId,
                username,
                email,
                role,
                globalElo,
                registeredAt
            });
            
            await user.save();
            console.log('User created in user service:', userId);
        } catch (error) {
            console.error('Error handling user creation:', error);
        }
    }

    async handleGameFinished(message) {
        try {
            const { userId, result } = message.data;
            
            const user = await User.findById(userId);
            if (!user) return;
            
            user.statistics.totalGames += 1;
            
            if (result === 'win') {
                user.statistics.totalWins += 1;
            } else if (result === 'loss') {
                user.statistics.totalLosses += 1;
            } else if (result === 'draw') {
                user.statistics.totalDraws += 1;
            }
            
            await user.save();
            
            // Publish user statistics updated event
            await rabbitmq.publishEvent('user_events', 'user.statistics.updated', {
                userId: user._id,
                statistics: user.statistics
            });
        } catch (error) {
            console.error('Error handling game finished:', error);
        }
    }

    async handleTournamentJoined(message) {
        try {
            const { userId } = message.data;
            
            const user = await User.findById(userId);
            if (!user) return;
            
            user.statistics.tournamentParticipations += 1;
            await user.save();
        } catch (error) {
            console.error('Error handling tournament joined:', error);
        }
    }

    async handleTournamentCompleted(message) {
        try {
            const { winnerId } = message.data;
            
            if (winnerId) {
                const user = await User.findById(winnerId);
                if (user) {
                    user.statistics.tournamentWins += 1;
                    await user.save();
                }
            }
        } catch (error) {
            console.error('Error handling tournament completed:', error);
        }
    }

    filterData(data) {
        const allowedFields = [
            'username', 'email', 'role', 'fide_id', 'globalElo',
            'profile.firstName', 'profile.lastName', 'profile.country',
            'profile.city', 'profile.birthDate', 'profile.profilePicture',
            'settings.emailNotifications', 'settings.publicProfile', 'settings.timezone'
        ];
        
        const filteredData = {};
        
        for (const field of allowedFields) {
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                if (data[parent] && data[parent][child] !== undefined) {
                    if (!filteredData[parent]) filteredData[parent] = {};
                    filteredData[parent][child] = data[parent][child];
                }
            } else if (data[field] !== undefined) {
                filteredData[field] = data[field];
            }
        }
        
        return filteredData;
    }

    hasAllRequiredFields(data) {
        const requiredFields = ['username', 'email'];
        return requiredFields.every(field => data[field] !== undefined && data[field] !== '');
    }

    async getUserById(id) {
        try {
            const user = await User.findById(id);
            if (!user) {
                throw new Error('User not found');
            }
            return user;
        } catch (error) {
            console.error('Error fetching user by ID:', error);
            throw error;
        }
    }

    async addUser(data) {
        try {
            const filteredData = this.filterData(data);
            
            if (!this.hasAllRequiredFields(filteredData)) {
                throw new Error('Missing required fields: username, email');
            }

            const user = new User(filteredData);
            await user.save();
            
            // Publish user created event
            await rabbitmq.publishEvent('user_events', 'user.created', {
                userId: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            });
            
            return user;
        } catch (error) {
            console.error('Error adding user:', error);
            throw error;
        }
    }

    async updateUser(id, data) {
        try {
            const filteredData = this.filterData(data);
            
            const user = await User.findByIdAndUpdate(
                id,
                { $set: filteredData },
                { new: true, runValidators: true }
            );
            
            if (!user) {
                throw new Error('User not found');
            }
            
            // Publish user updated event
            await rabbitmq.publishEvent('user_events', 'user.updated', {
                userId: user._id,
                updatedFields: Object.keys(filteredData)
            });
            
            return user;
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            const user = await User.findByIdAndUpdate(
                id,
                { isActive: false },
                { new: true }
            );
            
            if (!user) {
                throw new Error('User not found');
            }
            
            // Publish user deleted event
            await rabbitmq.publishEvent('user_events', 'user.deleted', {
                userId: user._id
            });
            
            return user;
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }

    async searchUsers(query) {
        try {
            const searchRegex = new RegExp(query, 'i');
            const users = await User.find({
                $or: [
                    { username: searchRegex },
                    { email: searchRegex },
                    { 'profile.firstName': searchRegex },
                    { 'profile.lastName': searchRegex }
                ],
                isActive: true
            }).select('-__v');
            
            return users;
        } catch (error) {
            console.error('Error searching users:', error);
            throw error;
        }
    }

    async getUserStatistics(id) {
        try {
            const user = await User.findById(id).select('statistics');
            if (!user) {
                throw new Error('User not found');
            }
            return user.statistics;
        } catch (error) {
            console.error('Error fetching user statistics:', error);
            throw error;
        }
    }

    async updateUserElo(id, newElo) {
        try {
            const user = await User.findByIdAndUpdate(
                id,
                { globalElo: newElo },
                { new: true }
            );
            
            if (!user) {
                throw new Error('User not found');
            }
            
            // Publish elo updated event
            await rabbitmq.publishEvent('user_events', 'user.elo.updated', {
                userId: user._id,
                newElo: newElo,
                oldElo: user.globalElo
            });
            
            return user;
        } catch (error) {
            console.error('Error updating user ELO:', error);
            throw error;
        }
    }

    async getAllUsers() {
        try {
            const users = await User.find();
            return users;
        } catch (error) {
            console.error('Error getting all users:', error);
            throw error;
        }
    }
}

module.exports = new UserService(); 