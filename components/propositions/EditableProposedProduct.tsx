import { useState, useMemo } from 'react';
import { CatalogueProduit, Suggestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Edit2 } from 'lucide-react';

interface EditableProposedProductProps {
  suggestion: Suggestion;
  catalogue: CatalogueProduit[];
  onProductChange: (product: CatalogueProduit) => void;
}

export function EditableProposedProduct({ 
  suggestion, 
  catalogue, 
  onProductChange 
}: EditableProposedProductProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [open, setOpen] = useState(false);

  // Trouver le produit sélectionné dans le catalogue s'il correspond
  // On compare par ID ou par nom si ID manquant
  const selectedProduct = useMemo(() => {
    return catalogue.find(p => 
      p.id === suggestion.produit_propose_id || 
      (p.nom === suggestion.produit_propose_nom && p.fournisseur === suggestion.produit_propose_fournisseur)
    );
  }, [catalogue, suggestion]);

  const handleSelect = (product: CatalogueProduit) => {
    onProductChange(product);
    setOpen(false);
    setIsEditing(false);
  };

  return (
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 relative group">
      <h4 className="text-xs font-bold text-blue-500 mb-3 uppercase tracking-wider">Proposé</h4>
      
      {!isEditing ? (
        <>
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setIsEditing(true)}
              className="p-1.5 hover:bg-blue-200 rounded-md transition-colors"
              title="Modifier le produit"
            >
              <Edit2 className="w-3.5 h-3.5 text-blue-600" />
            </button>
          </div>

          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-800">{suggestion.produit_propose_nom}</p>
              {suggestion.produit_propose_fournisseur ? (
                <p className="text-xs text-blue-600">{suggestion.produit_propose_fournisseur}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-blue-700">{suggestion.prix_propose.toFixed(2)}€</p>
              <span className="text-xs text-blue-500">/mois</span>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between bg-white">
                {selectedProduct ? selectedProduct.nom : (suggestion.produit_propose_nom || "Sélectionner un produit")}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-white border border-gray-200 shadow-lg" align="start">
              <Command className="bg-white">
                <CommandInput placeholder="Rechercher un produit..." />
                <CommandEmpty>Aucun produit trouvé.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-auto">
                  {catalogue.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={`${product.nom} ${product.fournisseur || ''}`}
                      onSelect={() => handleSelect(product)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedProduct?.id === product.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{product.nom}</span>
                        <span className="text-xs text-muted-foreground">
                          {(product.prix_mensuel || 0).toFixed(2)}€/mois {product.fournisseur ? `· ${product.fournisseur}` : ''}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          
          <div className="flex justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsEditing(false)}
              className="text-xs h-7 px-2"
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
