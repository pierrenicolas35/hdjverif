CREATE TABLE actes_cibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_ccam text NOT NULL,
  libelle text NOT NULL,
  environnement_lourd boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX actes_cibles_code_ccam_idx ON actes_cibles (code_ccam);

INSERT INTO actes_cibles (code_ccam, libelle, environnement_lourd)
VALUES
  ('GLQP002', 'Test de stimulation ou de freination des sécrétions endocriniennes', true),
  ('GLQP014', 'Épreuve de jeûne stricte prolongée pour le diagnostic d''hypoglycémie', true),
  ('GLQP007', 'Épreuve d''hyperglycémie provoquée', false),
  ('GLQP009', 'Pose d''un système d''enregistrement continu de la glycémie', false),
  ('QZQK002', 'Éducation thérapeutique complexe du patient diabétique', true);
