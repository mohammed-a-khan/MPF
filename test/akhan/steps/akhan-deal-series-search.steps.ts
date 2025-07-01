import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions, PageObject } from '../../../src/bdd/decorators/CSBDDStepDef';
import { ESSSSeriesPage } from '../pages/ESSSSeriesPage';

@StepDefinitions
export class CRRUDealSeriesSearchSteps extends CSBDDBaseStepDefinition {
    @PageObject(ESSSSeriesPage)
    private ESSSSeriesPage!: ESSSSeriesPage;

    @CSBDDStepDef('user verifies all search type options')
    async verifySearchTypeOptions() {
        await this.ESSSSeriesPage.verifySearchTypeOptions();
    }

    @CSBDDStepDef('user selects "{string}" from search type dropdown')
    async selectSearchType(searchType: string) {
        await this.ESSSSeriesPage.selectSearchType(searchType);
    }

    @CSBDDStepDef('user verifies all search attribute options')
    async verifySearchAttributeOptions() {
        await this.ESSSSeriesPage.verifySearchAttributeOptions();
    }

    @CSBDDStepDef('user selects "{string}" from search attribute dropdown')
    async selectSearchAttribute(attribute: string) {
        await this.ESSSSeriesPage.selectSearchAttribute(attribute);
    }

    @CSBDDStepDef('user enters search value "{string}"')
    async enterSearchValue(value: string) {
        await this.ESSSSeriesPage.enterSearchValue(value);
    }

    @CSBDDStepDef('user clicks on Search button')
    async clickSearch() {
        await this.ESSSSeriesPage.clickSearch();
    }

    @CSBDDStepDef('user should see "{string}" in search results')
    async verifySearchResults(expectedValue: string) {
        await this.ESSSSeriesPage.verifySearchResults(expectedValue);
    }
} 
