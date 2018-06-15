import React, {Component} from 'react';
import * as PropTypes from 'prop-types';
import scrollIntoView from 'dom-scroll-into-view';

const DEFAULT_VALUE = undefined;
const DEFAULT_LABEL = '';
const KEY_ENTER = 13;
const KEY_NUMPAD_ENTER = 176;
const KEY_UP = 38;
const KEY_DOWN = 40;

export default class Typeahead extends Component {
    static propTypes = {
        allowUnknownValue: PropTypes.bool,
        autoSelectSingleOption: PropTypes.bool,
        fieldName: PropTypes.string.isRequired,
        groups: PropTypes.arrayOf(PropTypes.shape({
            label: PropTypes.string.isRequired,
            value: PropTypes.any.isRequired
        })),
        id: PropTypes.string,
        isClearable: PropTypes.bool,
        isDisabled: PropTypes.bool,
        onBlur: PropTypes.func,
        onChange: PropTypes.func,
        options: PropTypes.arrayOf(PropTypes.shape({
            label: PropTypes.string.isRequired,
            value: PropTypes.any.isRequired
        })).isRequired,
        placeholder: PropTypes.string,
        renderEmptyGroups: PropTypes.bool,
        tabIndex: PropTypes.string,
        value: PropTypes.any
    };

    static defaultProps = {
        allowUnknownValue: false,
        autoSelectSingleOption: false,
        groups: undefined,
        id: undefined,
        isClearable: false,
        isDisabled: false,
        onBlur: () => {},
        onChange: () => {},
        options: [],
        placeholder: '',
        renderEmptyGroups: false,
        value: DEFAULT_VALUE
    };

    state = {
        options: undefined,
        highlightedIndex: undefined,
        isOpen: false,
        typedLabel: '',
        value: undefined
    };

    elementRefs;

    _handleFocus = () => {
        this.setState({
            isOpen: true
        });
    };

    _handleMouseDown = () => {
        this.setState({
            isOpen: true
        });
    };

    _handleBlur = () => {
        const previousValue = this.state.value;
        this._updateValue(() => {
            this._afterValueChanged(previousValue)();
            this._fireOnBlur();
        });
    };

    _handleChange = (e) => {
        const label = e.target.value || DEFAULT_LABEL;
        this.setState({
            typedLabel: label
        }, () => {
            this.setState({
                highlightedIndex: this._getHighlightedIndexByTypedLabel()
            });

            if (label === '' && this.props.isClearable) {
                this._clearValue();
            }
        });
    };

    _getHighlightedIndexByTypedLabel = () => {
        return this._getFilteredOptions().findIndex(this._byTypedLabel);
    };

    _handleKeyDown = (e) => {
        if (e.keyCode === KEY_UP) {
            this.setState({
                highlightedIndex: this._getPreviousIndex()
            }, () => {
                this._scrollHighlightedOptionIntoView();
            });
        } else if (e.keyCode === KEY_DOWN) {
            if (this.state.isOpen) {
                this.setState({
                    highlightedIndex: this._getNextIndex()
                }, () => {
                    this._scrollHighlightedOptionIntoView();
                });
            } else {
                this.setState({
                    isOpen: true
                });
            }
        } else if (e.keyCode === KEY_ENTER || e.keyCode === KEY_NUMPAD_ENTER) {
            if (this.state.isOpen) {
                const previousValue = this.state.value;
                this._updateValue(this._afterValueChanged(previousValue));
            }
        } else if (!this.state.isOpen) {
            this.setState({
                isOpen: true
            });
        }
    };

    _updateValue = (afterValueUpdated) => {
        const shouldUpdateValue = !this.state.isOpen;
        if (shouldUpdateValue) {
            afterValueUpdated();
        } else {
            const previousValue = this.state.value;
            const valueOfHighlightedOption = this._getValueOfHighlightedOption();
            const isUnknownValue = valueOfHighlightedOption === undefined;
            const isUnknownValueAndAllowed = isUnknownValue && this.props.allowUnknownValue;
            const nextValue = isUnknownValueAndAllowed ? this.state.typedLabel :
                isUnknownValue ? previousValue : valueOfHighlightedOption;
            this.setState({
                isOpen: false,
                value: nextValue,
                typedLabel: this._getLabelByValue(nextValue)
            }, afterValueUpdated);
        }
    };

    _createHandleMouseDown = (value, highlightedIndex) => (e) => {
        e.stopPropagation();
        e.preventDefault();
        const previousValue = this.state.value;
        this.setState({
            highlightedIndex,
            isOpen: false,
            typedLabel: this._getLabelByValue(value),
            value
        }, this._afterValueChanged(previousValue));
    };

    _afterValueChanged = (previousValue) => () => {
        if (previousValue !== this.state.value) {
            this._fireOnChange();
        }
    };

    _fireOnChange = () => {
        this.props.onChange(this.props.fieldName, this.state.value);
    };

    _fireOnBlur = () => {
        this.props.onBlur(this.props.fieldName, this.state.value);
    };

    _getValueOfHighlightedOption = () => {
        const highlightedIndex = this.state.highlightedIndex;
        if (highlightedIndex === undefined) {
            return DEFAULT_VALUE;
        }
        if (this.props.allowUnknownValue && highlightedIndex === -1) {
            return this.state.typedLabel;
        }
        if (highlightedIndex === -1) {
            return undefined;
        }
        const filteredOptions = this._getFilteredOptions();
        return filteredOptions[highlightedIndex].value;
    };

    _getInitialIndex = (props) => {
        const {options, value} = props;
        const currentOptionIndex = options.findIndex(opt => opt.value === value);
        return currentOptionIndex === -1 ? undefined : currentOptionIndex;
    };

    _getPreviousIndex = () => {
        const currentOptionIndex = this.state.highlightedIndex;
        const potentialPreviousOptionIndex = currentOptionIndex === undefined ? 0 : currentOptionIndex - 1;
        const hasPreviousOption = potentialPreviousOptionIndex >= 0;
        if (this.props.allowUnknownValue && !hasPreviousOption && this._isUnknownValue()) {
            return -1;
        }
        return hasPreviousOption ? potentialPreviousOptionIndex : currentOptionIndex;
    };

    _getNextIndex = () => {
        const currentOptionIndex = this.state.highlightedIndex;
        const potentialNextOptionIndex = currentOptionIndex === undefined ? this._getFirstGroupsFirstOptionIndex() :
            currentOptionIndex + 1;
        const hasNextOption = potentialNextOptionIndex < this._getFilteredOptions().length;
        return hasNextOption ? potentialNextOptionIndex : currentOptionIndex;
    };

    _getFirstGroupsFirstOptionIndex = () => this.props.groups === undefined ? 0 :
        this.state.options.findIndex(option => option.group === this.props.groups[0].value);

    _getLabel = () => {
        return this.state.typedLabel;
    };

    _sortOptionsByGroup = (options) => {
        const indexOfGroup = groupValue => this.props.groups.findIndex(group => group.value === groupValue);
        // This is necessary because Array.prototype.sort is not necessarily stable. See:
        // http://www.ecma-international.org/ecma-262/6.0/#sec-array.prototype.sort
        const wrappedOptions = options.map((option, index) => ({option, index}));
        wrappedOptions.sort((wrappedOptionA, wrappedOptionB) => {
            const groupComparison = indexOfGroup(wrappedOptionA.option.group) -
                indexOfGroup(wrappedOptionB.option.group);
            return groupComparison === 0 ? wrappedOptionA.index - wrappedOptionB.index : groupComparison;
        });
        return wrappedOptions.map(wrappedOption => wrappedOption.option);
    };

    _byTypedLabel = option => option.label.toLowerCase().includes(this.state.typedLabel.toLowerCase());

    _byGroupAndTypedLabel = option => {
        if (this.props.groups !== undefined) {
            const matchingGroupValues = this.props.groups.filter(this._byTypedLabel).map(group => group.value);
            if (matchingGroupValues.includes(option.group)) {
                return true;
            }
        }
        return this._byTypedLabel(option);
    };

    _getFilteredOptions = () => {
        const typedLabelMatchesCurrentOptionLabel = this.state.typedLabel === this._getLabelByValue(this.state.value);
        let options;
        if (typedLabelMatchesCurrentOptionLabel) {
            options = this.state.options;
        } else {
            options = this.state.options.filter(this._byGroupAndTypedLabel);
        }

        return options;
    };

    _getLabelByValue = (value, options = this.props.options) => {
        const option = options.find(opt => opt.value === value);
        if (option) {
            return option.label;
        } else if (this.props.allowUnknownValue && value !== undefined) {
            return value;
        }
        return DEFAULT_LABEL;
    };

    _clearValue = () => {
        this.setState({
            value: DEFAULT_VALUE,
            typedLabel: DEFAULT_LABEL,
            isOpen: false,
            highlightedIndex: undefined
        }, this._afterValueChanged(this.state.value));
    };

    _validateProps = () => {
        const {groups, options} = this.props;

        const groupsEnabled = groups !== undefined;
        const optionWithoutGroupExists = groupsEnabled &&
            options.some(option => !option.hasOwnProperty('group'));

        if (optionWithoutGroupExists) {
            throw new Error('There is at least one option without a group property.');
        }

        const optionWithMissingGroupExists = groupsEnabled &&
            options.some(option => !groups.some(group => group.value === option.group));

        if (optionWithMissingGroupExists) {
            throw new Error('There is at least one option with an unknown group.');
        }
    };

    _initializeFromProps = (props) => {
        this._validateProps();

        const {value, options, groups} = props;
        const sortedOptions = groups === undefined ? options : this._sortOptionsByGroup(options);
        this.setState({
            options: sortedOptions,
            highlightedIndex: this._getInitialIndex(props),
            value,
            typedLabel: this._getLabelByValue(value, sortedOptions)
        }, () => {
            if (props.autoSelectSingleOption && options.length === 1) {
                const valueOfSingleOption = options[0].value;
                this.setState({
                    highlightedIndex: 0,
                    value: valueOfSingleOption,
                    typedLabel: this._getLabelByValue(valueOfSingleOption)
                }, this._afterValueChanged(this.state.value));
            }
        });
    };

    _isUnknownValue = () => this.state.typedLabel !== '' &&
        this._getFilteredOptions().findIndex(option => option.label === this.state.typedLabel) === -1;

    _getAbsoluteIndex = option => this.state.options.findIndex(opt => opt.value === option.value);

    _relativeToAbsoluteIndex = (relativeIndex) => {
        const highlightedOption = this._getFilteredOptions()[relativeIndex];
        return this.state.options.indexOf(highlightedOption);
    };

    _scrollHighlightedOptionIntoView = () => {
        if (this.state.isOpen && this.state.highlightedIndex !== undefined && this.state.highlightedIndex !== -1) {
            const optionNode = this.elementRefs[`option_${this._relativeToAbsoluteIndex(this.state.highlightedIndex)}`];
            const menuNode = this.elementRefs['menu'];
            scrollIntoView(optionNode, menuNode, {onlyScrollIfNeeded: true});
        }
    };

    componentWillMount() {
        this.elementRefs = {};
    }

    componentDidMount() {
        this._initializeFromProps(this.props);
    }

    componentWillReceiveProps(nextProps) {
        this._initializeFromProps(nextProps);
    }

    renderNoOptionsMessage() {
        if (!this.props.allowUnknownValue && this._getFilteredOptions().length === 0 &&
            this.state.typedLabel.length !== 0) {
            return (
                <div className="typeahead__no_options">
                    <p><span className="typeahead__no_options__keyword">{this.state.typedLabel}</span> nicht
                        gefunden</p>
                </div>
            );
        }
    }

    renderUnknownValueOption() {
        if (this.props.allowUnknownValue && this.state.typedLabel.length !== 0 && this._isUnknownValue()) {
            const option = {
                label: this.state.typedLabel,
                value: this.state.typedLabel
            };
            return this.renderOption(option, -1);
        }
    }

    // noinspection JSMethodCanBeStatic
    renderNewOptionMarker() {
        return (<span className="typeahead__option__new_option"> (+) </span>);
    }

    renderOption = (option, absoluteIndex) => {
        return (
            <div ref={element => this.elementRefs[`option_${absoluteIndex}`] = element}
                key={`typeahead__option__${option.value}`}
                className="typeahead__option"
                data-index={absoluteIndex}
                data-value={option.value}
                data-highlighted={absoluteIndex === this._relativeToAbsoluteIndex(this.state.highlightedIndex)}
                data-group={option.group}
                onMouseDown={this._createHandleMouseDown(option.value, absoluteIndex)}>
                {option.label}
                {absoluteIndex === -1 ? this.renderNewOptionMarker() : null}
            </div>
        );
    };

    renderGroup = (group) => {
        const filteredOptions = this._getFilteredOptions();
        const groupOptions = filteredOptions.filter(option => option.group === group.value);

        if (!this.props.renderEmptyGroups && groupOptions.length === 0) {
            return null;
        }

        return (
            <div key={`typeahead__group__${group.value}`} className="typeahead__group" data-value={group.value}>
                <div className="typeahead__group__label">{group.label}</div>
                {groupOptions.map(option => this.renderOption(option, this._getAbsoluteIndex(option)))}
            </div>
        );
    };

    renderGroups() {
        return this.props.groups.map(this.renderGroup);
    }

    renderMenu() {
        if (this.state.isOpen) {
            return (
                <div ref={element => this.elementRefs['menu'] = element} className="typeahead__options">
                    {this.renderNoOptionsMessage()}
                    {this.renderUnknownValueOption()}
                    {this.props.groups === undefined ? this._getFilteredOptions().map(
                        option => this.renderOption(option, this._getAbsoluteIndex(option))) :
                        this.renderGroups()}
                </div>
            );
        }
    }

    _handleClearClick = (e) => {
        e.preventDefault();
        this._clearValue();
    };

    renderClearButton() {
        if (this.props.isClearable && this.state.value) {
            return (
                <button className="typeahead__clear" href="/#" onClick={this._handleClearClick}/>
            );
        }
    }

    render() {
        const idProp = this.props.id ? {id: this.props.id} : {};
        const tabIndexProp = this.props.tabIndex ? {tabIndex: this.props.tabIndex} : {};
        return (
            <div className="typeahead">
                <input
                    {...idProp}
                    {...tabIndexProp}
                    disabled={this.props.isDisabled}
                    name={this.props.fieldName}
                    onFocus={this._handleFocus}
                    onBlur={this._handleBlur}
                    onChange={this._handleChange}
                    onKeyDown={this._handleKeyDown}
                    onMouseDown={this._handleMouseDown}
                    placeholder={this.props.placeholder}
                    value={this._getLabel()}
                />
                {this.renderClearButton()}
                {this.renderMenu()}
            </div>
        );
    }
}