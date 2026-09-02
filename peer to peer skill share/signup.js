/* =========================================
   SKILLSHARE - MAIN SIGNUP.JS
   Signup → Save User → Dashboard
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================
       FIND FORM
    ===================================== */

    const form =
        document.querySelector("form");


    if (!form) {

        console.error(
            "SkillShare: Signup form not found."
        );

        return;

    }


    /* =====================================
       FIND INPUTS
    ===================================== */

    const nameInput =
        form.querySelector(
            'input[name="name"], input[id="name"], input[type="text"]'
        );


    const emailInput =
        form.querySelector(
            'input[name="email"], input[id="email"], input[type="email"]'
        );


    const passwordInput =
        form.querySelector(
            'input[name="password"], input[id="password"], input[type="password"]'
        );


    const submitButton =
        form.querySelector(
            'button[type="submit"]'
        ) ||
        form.querySelector("button");


    const termsCheckbox =
        form.querySelector(
            'input[type="checkbox"]'
        );


    /* =====================================
       TOAST SYSTEM
    ===================================== */

    function showToast(message, type = "success") {

        let toast =
            document.getElementById(
                "signupToast"
            );


        if (!toast) {

            toast =
                document.createElement("div");

            toast.id =
                "signupToast";

            document.body.appendChild(
                toast
            );

        }


        toast.textContent =
            message;


        toast.className =
            "signup-toast " + type;


        requestAnimationFrame(() => {

            toast.classList.add("show");

        });


        clearTimeout(
            window.signupToastTimer
        );


        window.signupToastTimer =
            setTimeout(() => {

                toast.classList.remove(
                    "show"
                );

            }, 2500);

    }


    /* =====================================
       PASSWORD SHOW / HIDE
    ===================================== */

    const passwordToggle =
        document.querySelector(
            "#togglePassword, #toggle, .password-toggle"
        );


    if (
        passwordToggle &&
        passwordInput
    ) {

        passwordToggle.addEventListener(
            "click",
            () => {

                if (
                    passwordInput.type ===
                    "password"
                ) {

                    passwordInput.type =
                        "text";

                    passwordToggle.textContent =
                        "◉";

                } else {

                    passwordInput.type =
                        "password";

                    passwordToggle.textContent =
                        "◌";

                }

            }
        );

    }


    /* =====================================
       PASSWORD STRENGTH
    ===================================== */

    if (passwordInput) {

        passwordInput.addEventListener(
            "input",
            () => {

                const password =
                    passwordInput.value;


                let score = 0;


                if (
                    password.length >= 6
                ) {

                    score += 25;

                }


                if (
                    password.length >= 8
                ) {

                    score += 25;

                }


                if (
                    /[A-Z]/.test(password)
                ) {

                    score += 15;

                }


                if (
                    /[0-9]/.test(password)
                ) {

                    score += 20;

                }


                if (
                    /[^A-Za-z0-9]/.test(password)
                ) {

                    score += 15;

                }


                score =
                    Math.min(
                        score,
                        100
                    );


                const strengthBar =
                    document.querySelector(
                        "#strengthBar"
                    );


                const strengthText =
                    document.querySelector(
                        "#strengthText"
                    );


                const strengthScore =
                    document.querySelector(
                        "#strengthScore"
                    );


                if (strengthBar) {

                    strengthBar.style.width =
                        score + "%";

                }


                if (strengthScore) {

                    strengthScore.textContent =
                        score + "%";

                }


                if (strengthText) {

                    if (score < 40) {

                        strengthText.textContent =
                            "Weak";

                    } else if (score < 70) {

                        strengthText.textContent =
                            "Medium";

                    } else if (score < 90) {

                        strengthText.textContent =
                            "Strong";

                    } else {

                        strengthText.textContent =
                            "Very Strong";

                    }

                }

            }
        );

    }


    /* =====================================
       VALIDATE NAME
       (real validation: just needs to be
        a real-looking name, no demo list)
    ===================================== */

    function validateName() {

        if (!nameInput) {

            showToast(
                "Name field not found.",
                "error"
            );

            return false;

        }


        const name =
            nameInput.value.trim();


        if (name.length < 2) {

            showToast(
                "Please enter your full name.",
                "error"
            );

            nameInput.focus();

            return false;

        }


        return true;

    }


    /* =====================================
       VALIDATE EMAIL
       (real format check, no fixed demo
        email required)
    ===================================== */

    function validateEmail() {

        if (!emailInput) {

            showToast(
                "Email field not found.",
                "error"
            );

            return false;

        }


        const email =
            emailInput.value
                .trim()
                .toLowerCase();


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (
            !emailPattern.test(email)
        ) {

            showToast(
                "Please enter a valid email address.",
                "error"
            );

            emailInput.focus();

            return false;

        }


        return true;

    }


    /* =====================================
       VALIDATE PASSWORD
       (just needs to be reasonably long,
        no fixed demo password required)
    ===================================== */

    function validatePassword() {

        if (!passwordInput) {

            showToast(
                "Password field not found.",
                "error"
            );

            return false;

        }


        const password =
            passwordInput.value;


        if (
            password.length < 6
        ) {

            showToast(
                "Password must be at least 6 characters.",
                "error"
            );

            passwordInput.focus();

            return false;

        }


        return true;

    }


    /* =====================================
       TERMS CHECKBOX
    ===================================== */

    function validateTerms() {

        /*
           If your signup page doesn't have
           a checkbox, automatically continue.
        */

        if (!termsCheckbox) {

            return true;

        }


        if (
            !termsCheckbox.checked
        ) {

            showToast(
                "Please accept the terms.",
                "error"
            );

            return false;

        }


        return true;

    }


    /* =====================================
       SAVE USER
    ===================================== */

    function saveUser(name, email) {

        const user = {

            name: name,

            email: email,

            role: "Learner",

            loggedIn: true

        };


        localStorage.setItem(
            "skillshareUser",
            JSON.stringify(user)
        );


        localStorage.setItem(
            "skillshareLoggedIn",
            "true"
        );


        /*
           Extra storage values can be useful
           later in your project.
        */

        localStorage.setItem(
            "skillshareName",
            name
        );


        localStorage.setItem(
            "skillshareEmail",
            email
        );

    }


    /* =====================================
       CREATE ACCOUNT
    ===================================== */

    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            /* -------------------------------
               VALIDATION
            -------------------------------- */

            if (!validateName()) {
                return;
            }


            if (!validateEmail()) {
                return;
            }


            if (!validatePassword()) {
                return;
            }


            if (!validateTerms()) {
                return;
            }


            /* -------------------------------
               BUTTON LOADING
            -------------------------------- */

            if (submitButton) {

                submitButton.disabled =
                    true;


                submitButton.classList.add(
                    "loading"
                );


                submitButton.dataset.originalText =
                    submitButton.textContent;


                submitButton.textContent =
                    "Creating Account...";

            }


            /* -------------------------------
               CREATE ACCOUNT VIA FASTAPI
            -------------------------------- */

            const name =
                nameInput.value.trim();


            const email =
                emailInput.value
                    .trim()
                    .toLowerCase();


            try {

                await window.SkillShareAPI.signup(
                    name,
                    email,
                    passwordInput.value
                );


                /* -------------------------------
                   AUTO LOGIN AFTER SIGNUP
                   (signup endpoint does not issue
                    a token, so we log in again)
                -------------------------------- */

                const session =
                    await window.SkillShareAPI.login(
                        email,
                        passwordInput.value
                    );


                window.SkillShareAPI.setSession(
                    session.access_token,
                    session.user
                );


                localStorage.setItem(
                    "skillshareLoggedIn",
                    "true"
                );


            } catch (error) {


                if (submitButton) {

                    submitButton.disabled =
                        false;


                    submitButton.classList.remove(
                        "loading"
                    );


                    submitButton.textContent =
                        submitButton.dataset.originalText ||
                        "Create Account";

                }


                showToast(
                    (error && error.detail) ||
                    (
                        error && error.status === 0
                            ? "Server unavailable. Please check that the backend is running."
                            : "Unable to create your account. Please try again."
                    ),
                    "error"
                );

                return;

            }


            /* -------------------------------
               SUCCESS
            -------------------------------- */

            if (submitButton) {

                submitButton.classList.remove(
                    "loading"
                );


                submitButton.classList.add(
                    "success"
                );


                submitButton.textContent =
                    "Account Created ✓";

            }


            showToast(
                `Welcome ${name}! Redirecting...`,
                "success"
            );


            /* -------------------------------
               REDIRECT
            -------------------------------- */

            setTimeout(() => {

                window.location.href =
                    "dashboard.html";

            }, 700);

        }
    );


    /* =====================================
       RIPPLE EFFECT
    ===================================== */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "button"
                );


            if (!button) {
                return;
            }


            const ripple =
                document.createElement(
                    "span"
                );


            ripple.className =
                "ripple";


            const rect =
                button.getBoundingClientRect();


            ripple.style.left =
                (
                    event.clientX -
                    rect.left
                ) + "px";


            ripple.style.top =
                (
                    event.clientY -
                    rect.top
                ) + "px";


            button.appendChild(
                ripple
            );


            setTimeout(() => {

                ripple.remove();

            }, 650);

        }
    );


    /* =====================================
       SOCIAL BUTTONS
    ===================================== */

    document
        .querySelectorAll(
            ".socials button, .social-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    showToast(
                        "Social login is demo-only.",
                        "info"
                    );

                }
            );

        });


    /* =====================================
       LOGIN LINK
    ===================================== */

    document
        .querySelectorAll(
            'a[href="#login"], #loginLink'
        )
        .forEach(link => {

            link.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    showToast(
                        "Demo login: demo@skillshare.com / 123456",
                        "info"
                    );

                }
            );

        });


    /* =====================================
       PAGE READY
    ===================================== */

    console.log(
        "SkillShare signup.js loaded successfully."
    );

});