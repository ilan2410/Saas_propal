DROP TRIGGER IF EXISTS update_propositions_updated_at ON public.propositions;
CREATE TRIGGER update_propositions_updated_at
BEFORE UPDATE OF nom_client ON public.propositions
FOR EACH ROW
WHEN (OLD.nom_client IS DISTINCT FROM NEW.nom_client)
EXECUTE FUNCTION public.update_updated_at_column();
