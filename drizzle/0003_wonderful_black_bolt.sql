CREATE TABLE "modelRouterSettings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
