document.addEventListener("DOMContentLoaded", () => {

    /* ==========================================
       DEMO ACCOUNT
       ========================================== */

    const DEMO_EMAIL = "demo@skillshare.com";
    const DEMO_PASSWORD = "123456";


    /* ==========================================
       ELEMENTS
       ========================================== */

    const loginForm = document.getElementById("loginForm");

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    const emailError = document.getElementById("emailError");
    const passwordError = document.getElementById("passwordError");

    const togglePassword =
        document.getElementById("togglePassword");

    const cursorGlow =
        document.getElementById("cursorGlow");

    const toast =
        document.getElementById("toast");

    const rememberCheckbox =
        document.getElementById("remember");


    /* ==========================================
       SAFETY CHECK
    ========================================== */

    if (!loginForm || !emailInput || !passwordInput) {
        console.error("Login form elements not found.");
        return;
    }


    /* ==========================================
       PASSWORD SHOW / HIDE
    ========================================== */

    if (togglePassword) {

        togglePassword.addEventListener("click", () => {

            if (passwordInput.type === "password") {

                passwordInput.type = "text";

                togglePassword.textContent = "◉";

                togglePassword.setAttribute(
                    "aria-label",
                    "Hide password"
                );

            } else {

                passwordInput.type = "password";

                togglePassword.textContent = "◉";

                togglePassword.setAttribute(
                    "aria-label",
                    "Show password"
                );

            }

        });

    }


    /* ==========================================
       EMAIL VALIDATION
    ========================================== */

    emailInput.addEventListener("input", () => {

        const email = emailInput.value.trim();

        if (email === "") {

            emailError.textContent = "";

            return;
        }


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            emailError.textContent =
                "Please enter a valid email address.";

        } else {

            emailError.textContent = "";

        }

    });


    /* ==========================================
       PASSWORD VALIDATION
    ========================================== */

    passwordInput.addEventListener("input", () => {

        const password = passwordInput.value;

        if (password === "") {

            passwordError.textContent = "";

            return;
        }


        if (password.length < 6) {

            passwordError.textContent =
                "Password must contain at least 6 characters.";

        } else {

            passwordError.textContent = "";

        }

    });


    /* ==========================================
       LOGIN FORM
    ========================================== */

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();


        const email =
            emailInput.value.trim();

        const password =
            passwordInput.value;


        let valid = true;


        /* ======================================
           EMAIL VALIDATION
        ====================================== */

        if (email === "") {

            emailError.textContent =
                "Email address is required.";

            valid = false;

        } else {

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (!emailPattern.test(email)) {

                emailError.textContent =
                    "Please enter a valid email address.";

                valid = false;

            } else {

                emailError.textContent = "";

            }

        }


        /* ======================================
           PASSWORD VALIDATION
        ====================================== */

        if (password === "") {

            passwordError.textContent =
                "Password is required.";

            valid = false;

        } else if (password.length < 6) {

            passwordError.textContent =
                "Password must contain at least 6 characters.";

            valid = false;

        } else {

            passwordError.textContent = "";

        }


        /* ======================================
           STOP IF FORM IS INVALID
        ====================================== */

        if (!valid) {

            showToast(
                "Please fix the errors above."
            );

            return;
        }


        /* ======================================
           LOGIN VIA FASTAPI BACKEND
        ====================================== */

        emailError.textContent = "";
        passwordError.textContent = "";


        const submitBtn = document.querySelector(".login-submit");

        if (submitBtn) {

            submitBtn.disabled = true;

            submitBtn.innerHTML =
                "<span>Signing in...</span>";

        }


        try {

            const result =
                await window.SkillShareAPI.login(
                    email,
                    password
                );


            /* ======================================
               SAVE SESSION
            ====================================== */

            window.SkillShareAPI.setSession(
                result.access_token,
                result.user
            );


            if (
                rememberCheckbox &&
                rememberCheckbox.checked
            ) {

                localStorage.setItem(
                    "skillshareLoggedIn",
                    "true"
                );

            } else {

                sessionStorage.setItem(
                    "skillshareLoggedIn",
                    "true"
                );

            }


            /* ======================================
               SUCCESS MESSAGE
            ====================================== */

            showToast(
                "Login successful! Welcome back."
            );


            /* ======================================
               REDIRECT TO DASHBOARD
            ====================================== */

            setTimeout(() => {

                window.location.href =
                    "dashboard.html";

            }, 700);


        } catch (error) {


            if (submitBtn) {

                submitBtn.disabled = false;

                submitBtn.innerHTML =
                    "<span>Login</span><b>→</b><i class=\"button-shine\"></i>";

            }


            const message =
                error && error.detail
                    ? error.detail
                    : (
                        error && error.status === 0
                            ? "Server unavailable. Please check that the backend is running."
                            : "Unable to log in. Please try again."
                    );


            /* ======================================
               AUTH FAILURE — 401 = bad credentials
            ====================================== */

            if (error && error.status === 401) {

                passwordError.textContent =
                    "Incorrect email or password.";

            }


            showToast(message);

        }

    });


    /* ==========================================
       CURSOR GLOW
    ========================================== */

    document.addEventListener("mousemove", (event) => {

        if (!cursorGlow) return;

        cursorGlow.style.left =
            event.clientX + "px";

        cursorGlow.style.top =
            event.clientY + "px";

    });


    /* ==========================================
       SOCIAL LOGIN BUTTONS
    ========================================== */

    const socialButtons =
        document.querySelectorAll(".social-btn");


    socialButtons.forEach((button) => {

        button.addEventListener("click", () => {

            const provider =
                button.innerText.trim();


            showToast(
                `${provider} login will open here.`
            );

        });

    });


    /* ==========================================
       FORGOT PASSWORD
    ========================================== */

    const forgotPassword =
        document.querySelector(".forgot");


    if (forgotPassword) {

        forgotPassword.addEventListener(
            "click",
            (event) => {

                event.preventDefault();


                showToast(
                    "Password recovery page coming soon."
                );

            }
        );

    }


    /* ==========================================
       SIGN UP LINK
    ========================================== */

    const signupLink =
        document.querySelector(".signup-prompt a");


    if (signupLink) {

        signupLink.addEventListener(
            "click",
            (event) => {

                /*
                 * signup.html is not created yet.
                 * Prevent the broken link for now.
                 */

                event.preventDefault();

                showToast(
                    "Sign Up page coming soon."
                );

            }
        );

    }


    /* ==========================================
       TOAST FUNCTION
    ========================================== */

    function showToast(message) {

        if (!toast) return;


        toast.textContent = message;

        toast.classList.add("show");


        clearTimeout(window.toastTimer);


        window.toastTimer =
            setTimeout(() => {

                toast.classList.remove("show");

            }, 3000);

    }

});