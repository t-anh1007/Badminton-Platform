CREATE TABLE "post_images" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "alt" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_images_postId_position_key" ON "post_images"("postId", "position");
CREATE UNIQUE INDEX "post_images_postId_objectKey_key" ON "post_images"("postId", "objectKey");
CREATE INDEX "post_images_postId_position_idx" ON "post_images"("postId", "position");

ALTER TABLE "post_images"
  ADD CONSTRAINT "post_images_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
