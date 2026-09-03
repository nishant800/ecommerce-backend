import {
    Router,
    Request,
    Response,
} from "express";

const router =
    Router();


// =========================================
// PRIVACY POLICY
// =========================================

router.get(
    "/privacy-policy",
    (_req: Request, res: Response) => {

        res.status(200).type("html").send(`

<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>
    Privacy Policy
</title>

<style>

body {
    font-family:
        Arial,
        Helvetica,
        sans-serif;

    line-height: 1.7;

    margin: 0;

    padding: 0;

    background:
        #f5f6f8;

    color:
        #222;
}

.container {
    max-width:
        900px;

    margin:
        30px auto;

    background:
        #fff;

    padding:
        30px;

    border-radius:
        12px;

    box-shadow:
        0 2px 12px
        rgba(0,0,0,0.08);
}

h1 {
    margin-top: 0;
}

h2 {
    margin-top:
        28px;
}

.notice {
    padding:
        15px;

    background:
        #eef5ff;

    border-radius:
        8px;

    margin:
        18px 0;
}

a {
    color:
        #0D6EFD;
}

</style>

</head>

<body>

<div class="container">

<h1>
    Privacy Policy
</h1>

<p>
    <strong>
        Last Updated:
    </strong>
    28 August 2026
</p>


<h2>
    1. Introduction
</h2>

<p>
This Privacy Policy explains how our application collects,
uses, stores and protects information when you use our
Customer App or Seller App.
</p>

<h2>
    2. Information We Collect
</h2>

<p>
We may collect your name, mobile number, email address,
delivery address, order information, account information
and other information required to provide our services.
</p>

<h2>
    3. How We Use Your Information
</h2>

<p>
We use your information to create and manage your account,
process orders, provide delivery, process replacements and
cancellations, provide customer support and send important
notifications.
</p>

<h2>
    4. Payment Information
</h2>

<p>
Payments may be processed through third-party payment
providers. We do not intentionally store complete card
or banking credentials on our servers.
</p>

<h2>
    5. Address and Order Information
</h2>

<p>
Your delivery address and order information are used to
process and deliver your purchases and provide related
support.
</p>

<h2>
    6. Notifications
</h2>

<p>
We may send notifications related to orders, shipping,
delivery, cancellations, replacements, account activity
and other important service information.
</p>

<h2>
    7. Third-Party Services
</h2>

<p>
We may use trusted third-party service providers for
payment processing, cloud hosting, image storage,
analytics, authentication and other application
functionality.
</p>

<h2>
    8. Data Security
</h2>

<p>
We take reasonable technical and organizational measures
to protect personal information against unauthorized
access, loss, misuse, alteration or disclosure.
</p>

<h2>
    9. Data Retention
</h2>

<p>
We retain information for as long as reasonably necessary
to provide our services, maintain records, resolve
disputes, prevent fraud and comply with legal obligations.
</p>

<h2>
    10. Account Deletion
</h2>

<div class="notice">

<p>
You can delete your account from the Customer App by using
the <strong>Delete Account</strong> option in your Profile.
</p>

<p>
You can also visit our
<a href="/account-deletion">
Account Deletion page
</a>
to obtain information about account deletion.
</p>

</div>

<h2>
    11. Children's Privacy
</h2>

<p>
Our application is not intentionally designed to collect
personal information from children without appropriate
authorization.
</p>

<h2>
    12. Changes to This Privacy Policy
</h2>

<p>
We may update this Privacy Policy from time to time.
The latest version will be made available through the
application and this public page.
</p>

<h2>
    13. Contact Us
</h2>

<p>
For privacy-related questions, requests or complaints,
please use the support/contact information provided by
the application or our official website.
</p>

</div>

</body>

</html>

        `);

    },
);


// =========================================
// ACCOUNT DELETION
// =========================================

router.get(
    "/account-deletion",
    (_req: Request, res: Response) => {

        res.status(200).type("html").send(`

<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>
    Account Deletion
</title>

<style>

body {
    font-family:
        Arial,
        Helvetica,
        sans-serif;

    line-height:
        1.7;

    margin:
        0;

    padding:
        0;

    background:
        #f5f6f8;

    color:
        #222;
}

.container {
    max-width:
        750px;

    margin:
        30px auto;

    background:
        #fff;

    padding:
        30px;

    border-radius:
        12px;

    box-shadow:
        0 2px 12px
        rgba(0,0,0,0.08);
}

h1 {
    margin-top:
        0;
}

.notice {
    background:
        #fff8e1;

    border:
        1px solid #f0c36d;

    padding:
        16px;

    border-radius:
        8px;

    margin:
        20px 0;
}

li {
    margin-bottom:
        8px;
}

</style>

</head>

<body>

<div class="container">

<h1>
    Account Deletion
</h1>

<p>
    This page explains how users can delete their account
    and associated personal information.
</p>

<h2>
    Delete from the App
</h2>

<p>
    Open the Customer App and go to:
</p>

<p>
    <strong>
        Profile → Delete Account
    </strong>
</p>

<p>
    You will be asked to confirm the deletion.
    After confirmation, your account will be deactivated
    and personal account information will be removed or
    anonymized according to our data-retention requirements.
</p>

<div class="notice">

<strong>
    Important
</strong>

<p>
    Some information may need to be retained where required
    for legal, security, fraud-prevention, accounting,
    dispute-resolution or other legitimate obligations.
</p>

</div>

<h2>
    What Happens After Deletion
</h2>

<ul>

<li>
    Your account access is disabled.
</li>

<li>
    Personal profile information is removed or anonymized.
</li>

<li>
    Login credentials can no longer be used for the deleted account.
</li>

<li>
    Certain legally required records may be retained.
</li>

</ul>

<h2>
    Privacy Policy
</h2>

<p>

Read our
<a href="/privacy-policy">
Privacy Policy
</a>
for more information about how personal information is
collected, used, stored and deleted.

</p>

</div>

</body>

</html>

        `);

    },
);


export default router;