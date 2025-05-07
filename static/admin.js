// Import Chart.js from CDN
// Add this to your HTML: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

let statsChart = null;
let userStatsChart = null;

// Toast notification function
function showToast(message, type = 'info') {
    console.log('Showing toast:', message, type);
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#3B82F6'
    };
    
    Toastify({
        text: message,
        duration: 3000,
        gravity: "top",
        position: "right",
        backgroundColor: colors[type] || colors.info,
        stopOnFocus: true
    }).showToast();
}

// Initialize admin panel
export async function initializeAdminPanel() {
    console.log('Initializing admin panel...');
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No token found');
            showToast("Please log in to access admin panel", "error");
            window.location.href = 'index.html';
            return;
        }

        console.log('Checking user data...');
        const response = await fetch('/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            console.log('Auth check failed:', response.status);
            showToast("Access denied. Admin privileges required.", "error");
            window.location.href = 'index.html';
            return;
        }

        const userData = await response.json();
        console.log('User data:', userData);

        if (!userData.is_admin && !userData.is_super_admin) {
            console.log('User is not admin');
            showToast("Access denied. Admin privileges required.", "error");
            window.location.href = 'index.html';
            return;
        }

        // Load initial data
        console.log('Loading admin stats...');
        await loadAdminStats();
        console.log('Loading user stats...');
        await loadUserStats();
        console.log('Loading stats history...');
        await loadStatsHistory();

        // Set up refresh interval
        setInterval(loadAdminStats, 60000); // Refresh every minute
    } catch (error) {
        console.error('Error initializing admin panel:', error);
        showToast("Failed to initialize admin panel", "error");
    }
}

// Load admin statistics
async function loadAdminStats() {
    console.log('Fetching admin stats...');
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            console.error('Failed to load admin stats:', response.status);
            throw new Error('Failed to load admin stats');
        }

        const stats = await response.json();
        console.log('Received admin stats:', stats);
        updateStatsDisplay(stats);
    } catch (error) {
        console.error('Error loading admin stats:', error);
        showToast('Failed to load admin statistics', 'error');
    }
}

// Load user statistics
async function loadUserStats() {
    console.log('Fetching user stats...');
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            console.error('Failed to load user stats:', response.status);
            throw new Error('Failed to load user stats');
        }

        const users = await response.json();
        console.log('Received user stats:', users);
        updateUserStatsTable(users);
        updateUserStatsChart(users);
    } catch (error) {
        console.error('Error loading user stats:', error);
        showToast('Failed to load user statistics', 'error');
    }
}

// Load stats history
async function loadStatsHistory() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/admin/stats/history?days=7', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load stats history');

        const history = await response.json();
        updateStatsHistoryChart(history);
    } catch (error) {
        console.error('Error loading stats history:', error);
        showToast('Failed to load statistics history', 'error');
    }
}

// Update stats display
function updateStatsDisplay(stats) {
    console.log('Updating stats display with:', stats);
    // Update stat cards
    document.getElementById('total-users').textContent = stats.total_users || 0;
    document.getElementById('total-conversations').textContent = stats.total_conversations || 0;
    document.getElementById('total-messages').textContent = stats.total_messages || 0;
    document.getElementById('active-users-24h').textContent = stats.active_users_24h || 0;
    document.getElementById('new-users-24h').textContent = stats.new_users_24h || 0;
    document.getElementById('new-messages-24h').textContent = stats.new_messages_24h || 0;
}

// Update user stats table
function updateUserStatsTable(users) {
    console.log('Updating user stats table with:', users);
    const tbody = document.querySelector('#user-stats-table tbody');
    if (!tbody) {
        console.error('User stats table body not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    users.forEach(user => {
        console.log('Processing user:', user);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="text-sm font-medium text-gray-900">${user.username}</div>
                    ${user.is_super_admin ? 
                        '<div class="ml-2 text-xs text-red-600 font-semibold">Super Admin</div>' : 
                        user.is_admin ? 
                        '<div class="ml-2 text-xs text-blue-600 font-semibold">Admin</div>' : 
                        ''}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.message_count || 0}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.conversation_count || 0}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(user.joined_at).toLocaleDateString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                ${!user.is_super_admin ? 
                    `<button onclick="toggleAdminStatus(${user.id})" class="text-indigo-600 hover:text-indigo-900">
                        ${user.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>` : 
                    ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update user stats chart
function updateUserStatsChart(users) {
    const ctx = document.getElementById('user-stats-chart').getContext('2d');
    
    if (userStatsChart) {
        userStatsChart.destroy();
    }

    // Sort users by message count
    const sortedUsers = [...users].sort((a, b) => b.message_count - a.message_count).slice(0, 10);

    userStatsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedUsers.map(user => user.username),
            datasets: [{
                label: 'Messages',
                data: sortedUsers.map(user => user.message_count),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Update stats history chart
function updateStatsHistoryChart(history) {
    const ctx = document.getElementById('stats-history-chart').getContext('2d');
    
    if (statsChart) {
        statsChart.destroy();
    }

    // Sort history by date
    const sortedHistory = [...history].sort((a, b) => new Date(a.stats_date) - new Date(b.stats_date));
    const dates = sortedHistory.map(stat => new Date(stat.stats_date).toLocaleDateString());
    
    statsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Active Users',
                    data: sortedHistory.map(stat => stat.active_users_24h),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'New Messages',
                    data: sortedHistory.map(stat => stat.new_messages_24h),
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'New Users',
                    data: sortedHistory.map(stat => stat.new_users_24h),
                    borderColor: 'rgb(245, 158, 11)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.1,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Count'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

// Toggle admin status
export async function toggleAdminStatus(userId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/admin/users/${userId}/toggle-admin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to toggle admin status');
        }

        showToast('Admin status updated successfully', 'success');
        await loadUserStats(); // Refresh user stats
    } catch (error) {
        console.error('Error toggling admin status:', error);
        showToast('Failed to update admin status', 'error');
    }
} 