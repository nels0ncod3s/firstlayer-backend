# Building the First Layer SDKs (JavaScript + React)

A step-by-step, beginner-friendly walkthrough for turning the First Layer REST API into two real, publishable packages: a plain JavaScript client, and a React wrapper built on top of it. This is exactly what the landing page's `firstlayer/react`-style code samples used to pretend already existed — once you've followed this guide, that stops being pretend.

We're doing **JavaScript and React only, for now**. Once these two feel solid, the same pattern (wrap the REST calls, expose a friendly API) applies to Svelte, Vue, Python, or anything else — you're not locked into just these two.

---

## 0. What you're actually building

Two small npm packages:

1. **`@your-scope/firstlayer-js`** — a plain JS client with zero dependencies. Under the hood it's just `fetch()` calls to your backend (the same `/v1/auth/signup`, `/v1/users`, etc. endpoints documented on the `/docs` page), wrapped in friendly method names.
2. **`@your-scope/firstlayer-react`** — a thin React layer on top of the JS client: a `<FirstLayerProvider>` component and some hooks, so React apps don't have to think about `fetch`, headers, or JSON parsing at all.

`@your-scope` is a placeholder — replace it everywhere in this guide with your own npm username or npm organization name (e.g. `@firstlayer`, `@ada-dev`, whatever you control). npm scoped package names have to be unique to *you*, not globally unique like unscoped names, so this is the easy way to guarantee the name is available.

---

## 1. Before you start

You'll need:

- **Node.js** installed (v18 or newer — check with `node -v` in a terminal).
- An **npm account** at [npmjs.com](https://www.npmjs.com) — free, only needed at the very end when you actually publish. You can do everything else first without one.
- Your `firstlayer-backend` running locally (`npm start` in that folder) — the SDK is just a wrapper around it, so you'll want something real to test against.
- Basic comfort with JavaScript. If React hooks are new to you, that's fine — Part 2 explains each one as it's introduced.

---

## Part 1 — The JavaScript SDK

### Step 1: Set up a workspace folder

Rather than building each package in total isolation, we'll use an **npm workspace** — a folder that holds multiple packages side by side and lets them reference each other locally without any publishing or manual linking. This is the same technique real SDK repos (Supabase's, Stripe's, etc.) use.

```bash
mkdir firstlayer-sdk
cd firstlayer-sdk
npm init -y
```

Open the `package.json` npm just created and replace its contents with:

```json
{
  "name": "firstlayer-sdk-monorepo",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*", "examples/*"]
}
```

`"private": true` matters — it stops npm from ever accidentally trying to publish this *root* folder itself (only the packages inside `packages/` should get published). The `workspaces` field tells npm "treat every folder under `packages/` and `examples/` as its own package, and link them together automatically."

Now create the folder for the JS package:

```bash
mkdir -p packages/js/src
```

### Step 2: `packages/js/package.json`

```json
{
  "name": "@your-scope/firstlayer-js",
  "version": "0.1.0",
  "description": "JavaScript client for the First Layer API",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js"
  },
  "files": ["src"],
  "license": "MIT"
}
```

A few things worth understanding here, since they trip people up later:

- `"type": "module"` — lets us use modern `import`/`export` syntax instead of older `require()`.
- `"files": ["src"]` — when you publish, npm only includes what's listed here (plus `package.json`/`README.md` automatically). Without this, you can accidentally publish test files, `.env` files, notes-to-self, etc.
- No dependencies at all — the whole point of this package is that it's just `fetch`, which every modern JS runtime already has.

### Step 3: Write the client

This is the actual SDK. Create `packages/js/src/index.js`:

```js
export function createClient({ apiKey, baseUrl }) {
  if (!apiKey) throw new Error("createClient requires an apiKey");
  if (!baseUrl) throw new Error("createClient requires a baseUrl");

  async function request(path, options = {}) {
    const res = await fetch(baseUrl + path, {
      method: options.method || "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Request failed with status " + res.status);
    }

    return data;
  }

  return {
    users: {
      signUp(email, password) {
        return request("/v1/auth/signup", { method: "POST", body: { email, password } });
      },
      list() {
        return request("/v1/users");
      },
      get(id) {
        return request("/v1/users/" + id);
      },
      update(id, updates) {
        return request("/v1/users/" + id, { method: "PATCH", body: updates });
      },
      delete(id) {
        return request("/v1/users/" + id, { method: "DELETE" });
      }
    }
  };
}
```

Notice this is **just the CRUD endpoints from the backend**, given nicer names. `createClient` doesn't do anything magic — it closes over your `apiKey`/`baseUrl` once, so every method after that is just `client.users.list()` instead of remembering headers and URLs by hand every time.

Why the nested `users: { ... }` shape instead of flat methods like `client.signUp()`? Two reasons: it reads clearly at the call site (`client.users.delete(id)` is unambiguous), and it leaves room to add `client.projects`, `client.keys`, etc. later without renaming anything that already exists.

### Step 4: Try it against your real backend

Add a temporary test file — `packages/js/scratch.js` (don't publish this one; it's just for you):

```js
import { createClient } from "./src/index.js";

const client = createClient({
  apiKey: "YOUR_REAL_API_KEY", // from Dashboard -> your project -> API
  baseUrl: "http://localhost:4000"
});

const { user } = await client.users.signUp("ada@example.com", "correct horse battery staple");
console.log("created:", user);

const { users } = await client.users.list();
console.log("all users:", users);
```

Run it:

```bash
cd packages/js
node scratch.js
```

If you see a real user object logged back, the SDK works end to end. This is the whole loop you'll repeat for every method you add later: write it, call it against the real backend, see real data come back.

### Step 5: Write a README (npm shows this on the package page)

Create `packages/js/README.md` with a short usage example — copy the snippet from Step 4, minus the `console.log` lines. This isn't optional busywork: it's the first (and sometimes only) thing anyone sees before deciding whether to trust your package.

### Step 6: Publish it

You don't have to do this yet — everything in Part 2 works against your *local* copy via the workspace, with nothing published. But when you're ready:

```bash
cd packages/js
npm login          # one-time, opens a browser to sign in
npm publish --access public
```

`--access public` is required the first time for **scoped** packages (anything starting with `@`) — npm defaults scoped packages to private, which requires a paid plan. `--access public` makes yours free and world-installable, same as any unscoped package.

From then on, whenever you change the code: bump the version (`npm version patch` for a small fix, `minor` for a new feature, `major` for a breaking change) and run `npm publish` again. npm won't let you publish the same version number twice — that's intentional, it's what makes versions trustworthy.

---

## Part 2 — The React SDK

This package depends on the one you just built. Its whole job is translating `client.users.list()` into something that feels native to React: a hook that gives you `{ users, loading, error }` and re-renders your component when the data shows up.

### Step 1: Set up the package

```bash
mkdir -p packages/react/src
```

`packages/react/package.json`:

```json
{
  "name": "@your-scope/firstlayer-react",
  "version": "0.1.0",
  "description": "React bindings for @your-scope/firstlayer-js",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "dependencies": {
    "@your-scope/firstlayer-js": "^0.1.0"
  },
  "files": ["src"],
  "license": "MIT"
}
```

Two things to notice:

- **`peerDependencies`** for React, not a regular `dependencies` entry. This tells npm "the app installing this package must supply its own React" — you never want a library bundling its own copy of React, since having two copies in one app causes broken hooks and confusing bugs.
- **`dependencies`** on `@your-scope/firstlayer-js` — because this package is *inside the same workspace*, npm automatically links it to your local `packages/js` folder instead of trying to download it from the internet. This is the payoff of setting up workspaces back in Part 1: it just works, no `npm link` ceremony needed.

Run `npm install` from the **root** `firstlayer-sdk` folder once now, so the workspace linking actually happens:

```bash
cd ../..    # back to firstlayer-sdk root
npm install
```

### Step 2: The Provider

Every React app using this SDK needs to configure it once (API key, backend URL) and make it available to every component underneath — that's what a Provider is for. Create `packages/react/src/context.jsx`:

```jsx
import { createContext, useContext, useMemo } from "react";
import { createClient } from "@your-scope/firstlayer-js";

const FirstLayerContext = createContext(null);

export function FirstLayerProvider({ apiKey, baseUrl, children }) {
  const client = useMemo(
    () => createClient({ apiKey, baseUrl }),
    [apiKey, baseUrl]
  );

  return (
    <FirstLayerContext.Provider value={client}>
      {children}
    </FirstLayerContext.Provider>
  );
}

export function useFirstLayer() {
  const client = useContext(FirstLayerContext);
  if (!client) {
    throw new Error("useFirstLayer must be used inside a <FirstLayerProvider>");
  }
  return client;
}
```

`useMemo` here matters: without it, `createClient(...)` would run again on *every* render, which is wasteful and would also break anything that depends on the client object staying the same between renders (like the `useUsers` hook you're about to write). The explicit error in `useFirstLayer` is a small kindness to whoever uses this later — "you forgot the Provider" is a much better error message than a cryptic `Cannot read property 'users' of null`.

### Step 3: A convenience hook

This is the part that actually saves people time — instead of every component manually calling `client.users.list()` and managing its own loading state, `useUsers()` does it once. Create `packages/react/src/useUsers.js`:

```js
import { useState, useEffect, useCallback } from "react";
import { useFirstLayer } from "./context.jsx";

export function useUsers() {
  const client = useFirstLayer();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    client.users
      .list()
      .then((data) => setUsers(data.users))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { users, loading, error, refresh };
}
```

The `refresh` function is returned on purpose — after a component calls `client.users.signUp(...)` to create someone new, it can call `refresh()` to pull the updated list, rather than you having to duplicate the fetching logic everywhere.

### Step 4: Tie it together

`packages/react/src/index.js`:

```js
export { FirstLayerProvider, useFirstLayer } from "./context.jsx";
export { useUsers } from "./useUsers.js";
```

This one file is the entire public surface of the package — anything not exported here, a user of your SDK simply can't import. That's a feature: it lets you freely refactor the internals later without breaking anyone.

### Step 5: Test it in a real React app

Create a throwaway React app inside the same workspace so it can pick up your local packages automatically:

```bash
# from the firstlayer-sdk root
npm create vite@latest examples/react-demo -- --template react
```

Add `"@your-scope/firstlayer-js"` and `"@your-scope/firstlayer-react"` as dependencies in `examples/react-demo/package.json` (version `"*"` is fine here, since workspaces resolve to your local copy regardless):

```json
"dependencies": {
  "@your-scope/firstlayer-js": "*",
  "@your-scope/firstlayer-react": "*"
}
```

Run `npm install` from the root again, then replace `examples/react-demo/src/App.jsx` with:

```jsx
import { FirstLayerProvider, useUsers } from "@your-scope/firstlayer-react";

function UserList() {
  const { users, loading, error } = useUsers();

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Something went wrong: {error.message}</p>;

  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>{u.email}</li>
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <FirstLayerProvider apiKey="YOUR_REAL_API_KEY" baseUrl="http://localhost:4000">
      <UserList />
    </FirstLayerProvider>
  );
}
```

```bash
cd examples/react-demo
npm run dev
```

Open the URL it prints. If your real users show up in a list, both packages — and the way they talk to each other — are working correctly, all without either one having been published to npm yet.

### Step 6: Publish

Same idea as Part 1, just in this package's folder, and only after the JS package is already published (since this one depends on it):

```bash
cd packages/react
npm publish --access public
```

If you update `packages/js` later, remember to also bump the version *range* in `packages/react/package.json`'s `dependencies` (e.g. `"^0.2.0"`) so people installing the React package actually pull in your fix.

---

## Common mistakes (so you don't lose an afternoon to them)

- **"Cannot find module '@your-scope/firstlayer-js'" inside `packages/react`** — you forgot to run `npm install` from the workspace *root* after adding the dependency. Workspace linking happens at install time, not automatically.
- **"You must sign up for private packages" when publishing** — you forgot `--access public`. Scoped packages (`@something/name`) default to private.
- **React hook errors ("Invalid hook call") in the example app** — almost always two copies of React in `node_modules` (one from the SDK, one from the example app). This is exactly why React is a `peerDependency`, not a regular one — double-check you didn't add it as a regular dependency by mistake.
- **Publishing fails with "you do not have permission to publish"** — someone else already owns that scope/name, or you're not logged in as the account that owns it. Double-check `npm whoami` matches the scope you're publishing under.

---

## What's next

- **More frameworks**: the pattern is identical every time — write a thin wrapper around `@your-scope/firstlayer-js` for Svelte (a store instead of a hook), Vue (a composable), etc. The JS package never needs to change for this.
- **TypeScript**: once the API surface feels stable, adding `.d.ts` type definitions (or converting to TypeScript outright) is the highest-value next step — it turns typos like `client.user.list()` into an editor error instead of a runtime one.
- **Auto-generated docs**: once you have real users of the SDK, keep the `/docs` page and this SDK in sync manually for now; a generator (TypeDoc, etc.) is worth it once the API stops changing every week.
