"use client";
export default function AssignmentSummary({ count }: { count: number }) {
  return (
    <div className="mt-4 bg-white p-3 rounded-lg shadow-sm">
      <h3 className="text-sm font-semibold mb-2">Assignment Summary</h3>
      <p className="text-xs text-gray-600">
        Total assignments selected:{" "}
        <span className="font-bold text-blue-600">{count}</span>
      </p>
    </div>
  );
}
