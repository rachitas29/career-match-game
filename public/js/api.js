const API_URL = `${window.location.protocol}//${window.location.host}/api`;

const api = {
    // Auth Helper
    checkAuth: () => {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        if (!token || !user) {
            // Clear any partial state
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    },

    checkGuest: () => {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        if (token && user) {
            window.location.href = 'dashboard.html';
        }
    },

    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    },

    getCurrentUser: () => {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    saveUser: (user) => {
        localStorage.setItem('user', JSON.stringify(user));
        // Mock token for now since backend doesn't return one yet
        localStorage.setItem('token', 'mock-session-token-' + Date.now());
    },

    // HTTP Methods
    get: async (endpoint) => {
        const token = localStorage.getItem('token');
        const user = api.getCurrentUser();

        let finalEndpoint = endpoint;
        if (user && user.id) {
            const separator = finalEndpoint.includes('?') ? '&' : '?';
            finalEndpoint += `${separator}user_id=${user.id}`;
        }

        try {
            const res = await fetch(`${API_URL}${finalEndpoint}`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            return await res.json();
        } catch (err) {
            return { error: 'Network error' };
        }
    },

    post: async (endpoint, data) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(data)
            });
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                return { error: `Server error (${res.status}): ${text.substring(0, 100)}` };
            }
        } catch (err) {
            return { error: 'Network error: ' + err.message };
        }
    },

    put: async (endpoint, data) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(data)
            });
            return await res.json();
        } catch (err) {
            return { error: 'Network error' };
        }
    },

    delete: async (endpoint) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            return await res.json();
        } catch (err) {
            return { error: 'Network error' };
        }
    }
};
