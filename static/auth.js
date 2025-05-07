document.addEventListener('DOMContentLoaded', () => {
    // Get all required DOM elements
    const signupForm = document.getElementById('signup-form');
    const signinForm = document.getElementById('signin-form');
    const showSignup = document.getElementById('show-signup');
    const showSignin = document.getElementById('show-signin');
    const adminPanelLink = document.getElementById('admin-panel-link');
    const signupBtn = document.getElementById('signup-btn');
    const signinBtn = document.getElementById('signin-btn');
    const welcomeSigninBtn = document.getElementById('welcome-signin-btn');
    const welcomeSignupBtn = document.getElementById('welcome-signup-btn');

    // Function to show a section and hide others
    function showSection(sectionId) {
        // First, hide all sections
        ['welcome', 'signin', 'signup', 'chat'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('hidden');
                if (id === 'chat') {
                    element.classList.remove('flex');
                }
            }
        });

        // Then show the requested section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
            if (sectionId === 'chat') {
                targetSection.classList.add('flex');
            }
        }
    }

    // Function to show toast notifications
    function showToast(message, type = 'info') {
        if (typeof Toastify === 'undefined') {
            console.error('Toastify is not loaded');
            return;
        }
        Toastify({
            text: message,
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                background: type === 'error' ? '#EF4444' : 
                           type === 'success' ? '#10B981' : 
                           type === 'warning' ? '#F59E0B' : '#3B82F6'
            }
        }).showToast();
    }

    // Check if user is logged in and has admin status
    const checkAdminStatus = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch('/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                if (userData.is_admin || userData.is_super_admin) {
                    if (adminPanelLink) {
                        adminPanelLink.classList.remove('hidden');
                        // Add a special badge for super admin
                        if (userData.is_super_admin) {
                            adminPanelLink.innerHTML = `
                                <div class="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5 text-red-600">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                    <span class="text-sm font-semibold text-red-600">Super Admin</span>
                                </div>
                            `;
                        } else {
                            adminPanelLink.innerHTML = `
                                <div class="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5 text-indigo-600">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span class="text-sm font-semibold text-indigo-600">Admin Panel</span>
                                </div>
                            `;
                        }
                    }
                } else if (adminPanelLink) {
                    adminPanelLink.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error checking admin status:', error);
        }
    };

    // Check admin status on page load
    checkAdminStatus();

    // Toggle between signin and signup forms
    if (showSignup) {
        showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('signup');
        });
    }

    if (showSignin) {
        showSignin.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('signin');
        });
    }

    // Handle signup form submission
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('signup-username');
            const passwordInput = document.getElementById('signup-password');
            const confirmPasswordInput = document.getElementById('signup-confirm-password');
            const submitBtn = signupForm.querySelector('button[type="submit"]');

            if (!usernameInput || !passwordInput || !confirmPasswordInput) {
                console.error('Required form elements not found');
                return;
            }

            const username = usernameInput.value;
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (password !== confirmPassword) {
                showToast("Passwords do not match", "error");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
            }

            try {
                const response = await fetch('/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.access_token);
                    showToast("Signup successful!", "success");
                    showSection('chat');
                    await checkAdminStatus();
                    window.location.reload();
                } else {
                    throw new Error(data.detail || "Signup failed");
                }
            } catch (error) {
                console.error("Signup error:", error);
                showToast(error.message || "Signup failed", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Continue';
                }
            }
        });
    }

    // Handle signin form submission
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('signin-username');
            const passwordInput = document.getElementById('signin-password');
            const submitBtn = signinForm.querySelector('button[type="submit"]');

            if (!usernameInput || !passwordInput) {
                console.error('Required form elements not found');
                return;
            }

            const username = usernameInput.value;
            const password = passwordInput.value;

            if (!username || !password) {
                showToast('Please enter both username and password', 'error');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
            }

            try {
                const response = await fetch('/auth/signin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || 'Login failed');
                }

                localStorage.setItem('token', data.access_token);
                showToast('Login successful!', 'success');
                showSection('chat');
                await checkAdminStatus();
                window.location.reload();
            } catch (error) {
                console.error('Login error:', error);
                showToast(error.message || 'Login failed. Please check your credentials.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Continue';
                }
            }
        });
    }

    // Welcome screen button handlers
    if (welcomeSigninBtn) {
        welcomeSigninBtn.addEventListener('click', () => {
            showSection('signin');
        });
    }

    if (welcomeSignupBtn) {
        welcomeSignupBtn.addEventListener('click', () => {
            showSection('signup');
        });
    }
});

// After successful login
async function handleSuccessfulLogin(userData) {
    localStorage.setItem('token', userData.token);
    localStorage.setItem('username', userData.username);
    
    // Hide auth sections and show chat
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('signin').classList.add('hidden');
    document.getElementById('signup').classList.add('hidden');
    document.getElementById('chat').classList.remove('hidden');
    
    // Initialize admin panel if user is admin
    if (userData.is_admin || userData.is_super_admin) {
        const { initializeAdminPanel } = await import('./admin.js');
        await initializeAdminPanel();
    }
    
    // Initialize other components
    const { initializeChat } = await import('./chat.js');
    await initializeChat();
}