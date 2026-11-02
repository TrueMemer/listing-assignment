"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import {
  propertyDetailSchema,
  type Property,
  type PropertyDetail,
} from "@/domain/catalog";

export function PhotoUpload({
  property,
  onUploaded,
  onConflict,
  disabled = false,
  onPendingChange,
}: {
  property: Property;
  disabled?: boolean;
  onPendingChange: (pending: boolean) => void;
  onUploaded: (detail: PropertyDetail) => void;
  onConflict: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File | undefined) {
    if (!file || pending || disabled) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG or WebP image up to 5 MB.");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    body.set("sourceVersion", String(property.sourceVersion));
    setPending(true);
    onPendingChange(true);
    try {
      const response = await fetch(`/api/properties/${property.id}/photo`, {
        method: "POST",
        body,
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 409) onConflict();
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          data.error &&
          typeof data.error === "object" &&
          "message" in data.error &&
          typeof data.error.message === "string"
        )
          throw new Error(data.error.message);
        throw new Error("Could not upload the photo. Please retry.");
      }
      const detail = propertyDetailSchema.safeParse(data);
      if (!detail.success)
        throw new Error("Reload the property to check the uploaded photo.");
      onUploaded(detail.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload the photo. Please retry.",
      );
    } finally {
      setPending(false);
      onPendingChange(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-3 font-semibold">Photo</h2>
      <div className="relative h-48 w-full overflow-hidden rounded-field">
        <Image
          src={property.imagePath}
          alt={property.name}
          fill
          sizes="(max-width:1023px) 360px,320px"
          className="object-cover"
          unoptimized={property.imagePath.startsWith("/api/photos/")}
        />
      </div>
      <input
        ref={input}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Property photo"
        onChange={(event) => upload(event.target.files?.[0])}
      />
      <button
        className="btn mt-4 w-full"
        type="button"
        disabled={pending || disabled}
        onClick={() => input.current?.click()}
      >
        {pending ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <UploadSimpleIcon size={17} />
        )}
        Upload photo
      </button>
      {error && (
        <p role="alert" className="alert alert-error mt-3 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
