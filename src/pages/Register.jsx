import { useState } from "react";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">
          Register
        </h2>

        <input
          type="text"
          placeholder="Full Name"
          className="w-full p-2 mb-4 border rounded"
          value={form.name}
          onChange={(e) =>
            setForm({ ...form, name: e.target.value })
          }
        />

        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-4 border rounded"
          value={form.email}
          onChange={(e) =>
            setForm({ ...form, email: e.target.value })
          }
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-4 border rounded"
          value={form.password}
          onChange={(e) =>
            setForm({ ...form, password: e.target.value })
          }
        />

        <button className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600">
          Register
        </button>
        <p className="text-center mt-4">
            Already have an account?{" "}
            <a href="/" className="text-blue-500">
                Login
            </a>
        </p>
      </div>
    </div>
  );
}