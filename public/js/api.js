const API_URL = `${window.location.protocol}//${window.location.host}/api`;

const api = {
    // Auth Helper
    checkAuth: () => {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        if (!token || !user) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return;
        }
        // Inject Admin Panel link for rachita@appolosys.com
        const parsedUser = JSON.parse(user);
        if (parsedUser.email && parsedUser.email.toLowerCase() === 'rachita@appolosys.com') {
            document.addEventListener('DOMContentLoaded', () => {
                const nav = document.querySelector('.sidebar-nav');
                if (nav && !nav.querySelector('.admin-nav-link')) {
                    const link = document.createElement('a');
                    link.href = 'admin-reset.html';
                    link.className = 'nav-item admin-nav-link';
                    link.style.cssText = 'color: #a78bfa; font-weight: 600;';
                    link.textContent = '⚙️ Admin Panel';
                    nav.appendChild(link);
                }
            });
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

    saveUser: (user, token) => {
        localStorage.setItem('user', JSON.stringify(user));
        // Store the real JWT returned from the server
        localStorage.setItem('token', token);
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
