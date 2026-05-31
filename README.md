# Tailor St

Tailor St is a no-payment school uniform exchange app. Students can browse available donated uniforms, reserve an item anonymously, and choose an available pickup slot. Admins can add inventory, publish pickup slots, see reservations, and check off completed pickups.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add your Supabase project URL and public anon key.
3. Run the SQL in `supabase-schema.sql` inside Supabase SQL Editor.
4. In Supabase Authentication, create an admin user with email and password.
5. Keep `REACT_APP_ADMIN_PASSCODE` only for local demo mode when Supabase is not connected.

## Scripts

### `npm start`

Runs the app locally.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm run build`

Builds the app for production to the `build` folder.

## Deploy Notes

For Vercel, use:

- Framework preset: Create React App
- Build command: `npm run build`
- Output directory: `build`
- Environment variables from `.env.example`

The app includes demo data when Supabase environment variables are not set. For production, connect Supabase, create an admin Auth user, and use row-level security policies from `supabase-schema.sql`.

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
